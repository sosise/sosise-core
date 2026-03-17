import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import LoggerStorageRepositoryInterface from './LoggerStorageRepositoryInterface';
import os from 'os';
import { inspect } from 'util';
import LoggingChannelDoesNotExistsException from '../../Exceptions/Logger/LoggingChannelDoesNotExistsException';

/**
 * Regex for parsing log file names
 * Matches: prefix-YYYY-MM-DD.log, prefix-YYYY-MM-DD.1.log, prefix-YYYY-MM-DD.log.gz, prefix-YYYY-MM-DD.1.log.gz
 */
const LOG_FILE_REGEX = /^(.+)-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.log(\.gz)?$/;

/**
 * Parsed log file metadata
 */
interface LogFileInfo {
    fileName: string;
    filePath: string;
    prefix: string;
    date: string;
    counter?: number;
    compressed: boolean;
    size: number;
}

export default class LoggerFileRepository implements LoggerStorageRepositoryInterface {
    private loggingConfig: any;

    /**
     * Constructor
     */
    constructor(loggingConfig: any) {
        this.loggingConfig = loggingConfig;
        this.createLogFilesDirectoryIfItDoesNotExists();
        this.rotateLogFiles();
        this.schedulePeriodicRotation();
    }

    /**
     * Log debug message
     */
    public debug(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('debug', message, params) + os.EOL);
    }

    /**
     * Log info message
     */
    public info(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('info', message, params) + os.EOL);
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('warning', message, params) + os.EOL);
    }

    /**
     * Log error message
     */
    public error(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('error', message, params) + os.EOL);
    }

    /**
     * Log critical message
     */
    public critical(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('critical', message, params) + os.EOL);
    }

    /**
     * Creates log files directory if needed
     */
    private createLogFilesDirectoryIfItDoesNotExists(): void {
        if (!fs.existsSync(this.loggingConfig.logFilesDirectory)) {
            fs.mkdirSync(this.loggingConfig.logFilesDirectory, { recursive: true });
        }
    }

    /**
     * Get current log file path
     */
    private getLogFilePath(channel: string | undefined): string {
        // If channel is given, try to get it from the config
        if (channel) {
            this.throwExceptionIfChannelDoesNotExists(channel);
            const specificLogFileNamePrefix = this.loggingConfig.channels[channel].logFileNamePrefix;
            return `${this.loggingConfig.logFilesDirectory}/${specificLogFileNamePrefix}-${dayjs().format('YYYY-MM-DD')}.log`;
        }

        this.throwExceptionIfChannelDoesNotExists('default');
        const defaultLogFileNamePrefix = this.loggingConfig.channels.default.logFileNamePrefix;
        return `${this.loggingConfig.logFilesDirectory}/${defaultLogFileNamePrefix}-${dayjs().format('YYYY-MM-DD')}.log`;
    }

    /**
     * Throws exception if channel does not exists
     */
    private throwExceptionIfChannelDoesNotExists(channel: string) {
        if (this.loggingConfig.channels[channel] !== undefined) {
            return;
        }
        throw new LoggingChannelDoesNotExistsException('Logging channel does not exists', channel);
    }

    /**
     * Compose and return a pretty string for logger (b&w)
     */
    private makePrettyStringNoColor(
        level: 'debug' | 'info' | 'warning' | 'error' | 'critical',
        message: string,
        params: any = null,
    ): string {
        const levelString: string = (() => {
            switch (level) {
                case 'debug':
                    return 'DEBUG';
                case 'info':
                    return 'INFO ';
                case 'warning':
                    return 'WARN ';
                case 'error':
                    return 'ERROR';
                case 'critical':
                    return 'CRIT ';
            }
        })();

        // Prepare params string
        const paramsString = params !== null ? inspect(params, { depth: null, maxArrayLength: null, colors: false }) : '';

        // Prepare a string
        const outputString: string = `${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${levelString} ${message} ${paramsString}`;

        // Return a composed string
        return outputString;
    }

    // ──────────────────────────────────────────────────────────────────
    // Log Rotation
    // ──────────────────────────────────────────────────────────────────

    /**
     * Run all rotation phases in order
     */
    private rotateLogFiles(): void {
        try {
            const rotation = this.loggingConfig.rotation;
            if (!rotation || !rotation.enabled) {
                return;
            }

            let stats = { rotated: 0, compressed: 0, deletedByAge: 0, deletedBySize: 0 };

            // Phase 1: Rotate oversized active files
            stats.rotated = this.rotateOversizedActiveFiles();

            // Phase 2: Compress old log files
            stats.compressed = this.compressOldLogFiles();

            // Phase 3: Delete files older than maxAgeDays
            stats.deletedByAge = this.deleteExpiredFiles();

            // Phase 4: Enforce total directory size limit
            stats.deletedBySize = this.enforceMaxTotalSize();

            // Report results to console (not to file — avoid recursion)
            const totalActions = stats.rotated + stats.compressed + stats.deletedByAge + stats.deletedBySize;
            if (totalActions > 0) {
                console.log(
                    `[LogRotation] Rotated: ${stats.rotated}, Compressed: ${stats.compressed}, ` +
                    `Deleted (age): ${stats.deletedByAge}, Deleted (size): ${stats.deletedBySize}`
                );
            }
        } catch (error: any) {
            console.error('[LogRotation] Error during log rotation:', error.message);
        }
    }

    /**
     * Phase 1: Rotate active log files that exceed maxFileSizeMb
     * Active file is renamed with a numeric suffix and compressed,
     * a new empty file will be created automatically on next write
     */
    private rotateOversizedActiveFiles(): number {
        const maxFileSizeBytes = this.loggingConfig.rotation.maxFileSizeMb * 1024 * 1024;
        if (maxFileSizeBytes <= 0) {
            return 0;
        }

        let rotatedCount = 0;
        const logDir = this.loggingConfig.logFilesDirectory;
        const files = this.getLogDirectoryFiles();

        for (const file of files) {
            // Only process active files (today's date, no counter, not compressed)
            if (!this.isActiveLogFile(file.fileName)) {
                continue;
            }

            if (file.size > maxFileSizeBytes) {
                const nextCounter = this.getNextCounter(file.prefix, file.date, files);
                const rotatedName = `${file.prefix}-${file.date}.${nextCounter}.log`;
                const rotatedPath = path.join(logDir, rotatedName);

                try {
                    // Rename active file to numbered version
                    fs.renameSync(file.filePath, rotatedPath);

                    // Compress the rotated file immediately
                    this.compressFile(rotatedPath);

                    rotatedCount++;
                } catch (error: any) {
                    console.error(`[LogRotation] Failed to rotate ${file.fileName}: ${error.message}`);
                }
            }
        }

        return rotatedCount;
    }

    /**
     * Phase 2: Compress old .log files
     * Files older than compressAfterDays are gzip compressed
     * Numbered chunks (e.g. sosise-2026-03-17.1.log) are compressed immediately regardless of age
     */
    private compressOldLogFiles(): number {
        const compressAfterDays = this.loggingConfig.rotation.compressAfterDays;
        const cutoffDate = dayjs().subtract(compressAfterDays, 'day').format('YYYY-MM-DD');
        let compressedCount = 0;
        const files = this.getLogDirectoryFiles();

        for (const file of files) {
            // Skip already compressed files
            if (file.compressed) {
                continue;
            }

            // Skip active files
            if (this.isActiveLogFile(file.fileName)) {
                continue;
            }

            // Compress if: file is a numbered chunk OR file date is older than cutoff
            const shouldCompress = file.counter !== undefined || file.date <= cutoffDate;

            if (shouldCompress) {
                try {
                    this.compressFile(file.filePath);
                    compressedCount++;
                } catch (error: any) {
                    console.error(`[LogRotation] Failed to compress ${file.fileName}: ${error.message}`);
                }
            }
        }

        return compressedCount;
    }

    /**
     * Phase 3: Delete files older than maxAgeDays
     */
    private deleteExpiredFiles(): number {
        const maxAgeDays = this.loggingConfig.rotation.maxAgeDays;
        const cutoffDate = dayjs().subtract(maxAgeDays, 'day').format('YYYY-MM-DD');
        let deletedCount = 0;
        const files = this.getLogDirectoryFiles();

        for (const file of files) {
            if (file.date < cutoffDate) {
                try {
                    fs.unlinkSync(file.filePath);
                    deletedCount++;
                } catch (error: any) {
                    console.error(`[LogRotation] Failed to delete ${file.fileName}: ${error.message}`);
                }
            }
        }

        return deletedCount;
    }

    /**
     * Phase 4: Enforce max total directory size
     * Delete oldest files first until total size is under limit
     * Active log files are NEVER deleted
     */
    private enforceMaxTotalSize(): number {
        const maxTotalSizeBytes = this.loggingConfig.rotation.maxTotalSizeMb * 1024 * 1024;
        if (maxTotalSizeBytes <= 0) {
            return 0;
        }

        let files = this.getLogDirectoryFiles();
        let totalSize = files.reduce((sum, f) => sum + f.size, 0);

        if (totalSize <= maxTotalSizeBytes) {
            return 0;
        }

        // Sort deletable files by date ascending (oldest first), then by counter ascending
        const deletable = files
            .filter((f) => !this.isActiveLogFile(f.fileName))
            .sort((a, b) => {
                if (a.date !== b.date) {
                    return a.date.localeCompare(b.date);
                }
                return (a.counter || 0) - (b.counter || 0);
            });

        let deletedCount = 0;

        for (const file of deletable) {
            if (totalSize <= maxTotalSizeBytes) {
                break;
            }

            try {
                fs.unlinkSync(file.filePath);
                totalSize -= file.size;
                deletedCount++;
            } catch (error: any) {
                console.error(`[LogRotation] Failed to delete ${file.fileName}: ${error.message}`);
            }
        }

        return deletedCount;
    }

    /**
     * Compress a file with gzip and delete the original
     */
    private compressFile(filePath: string): void {
        const content: Buffer = fs.readFileSync(filePath);
        const compressed: Buffer = zlib.gzipSync(content as unknown as Uint8Array);
        fs.writeFileSync(filePath + '.gz', compressed as unknown as Uint8Array);
        fs.unlinkSync(filePath);
    }

    /**
     * Parse a log file name into its components
     * Returns null if file name doesn't match the expected pattern
     */
    private parseLogFileName(fileName: string): { prefix: string; date: string; counter?: number; compressed: boolean } | null {
        const match = fileName.match(LOG_FILE_REGEX);
        if (!match) {
            return null;
        }

        return {
            prefix: match[1],
            date: match[2],
            counter: match[3] ? parseInt(match[3], 10) : undefined,
            compressed: match[4] === '.gz',
        };
    }

    /**
     * Check if a file is an active log file
     * Active = today's date, no numeric counter, not compressed (.log extension)
     */
    private isActiveLogFile(fileName: string): boolean {
        const parsed = this.parseLogFileName(fileName);
        if (!parsed) {
            return false;
        }
        const today = dayjs().format('YYYY-MM-DD');
        return parsed.date === today && parsed.counter === undefined && !parsed.compressed;
    }

    /**
     * Get the next available counter for a rotated file
     * E.g. if sosise-2026-03-17.1.log.gz exists, returns 2
     */
    private getNextCounter(prefix: string, date: string, files: LogFileInfo[]): number {
        let maxCounter = 0;

        for (const file of files) {
            if (file.prefix === prefix && file.date === date && file.counter !== undefined) {
                maxCounter = Math.max(maxCounter, file.counter);
            }
        }

        return maxCounter + 1;
    }

    /**
     * Get all log files from the log directory with their metadata
     * Only returns files matching the log file pattern (ignores .gitignore, etc.)
     */
    private getLogDirectoryFiles(): LogFileInfo[] {
        const logDir = this.loggingConfig.logFilesDirectory;

        if (!fs.existsSync(logDir)) {
            return [];
        }

        const allFiles = fs.readdirSync(logDir);
        const logFiles: LogFileInfo[] = [];

        for (const fileName of allFiles) {
            const parsed = this.parseLogFileName(fileName);
            if (!parsed) {
                continue; // Skip non-log files (.gitignore, README, etc.)
            }

            const filePath = path.join(logDir, fileName);

            try {
                const stat = fs.statSync(filePath);
                logFiles.push({
                    fileName,
                    filePath,
                    prefix: parsed.prefix,
                    date: parsed.date,
                    counter: parsed.counter,
                    compressed: parsed.compressed,
                    size: stat.size,
                });
            } catch {
                // File might have been deleted between readdir and stat
                continue;
            }
        }

        return logFiles;
    }

    /**
     * Schedule periodic rotation check
     */
    private schedulePeriodicRotation(): void {
        const rotation = this.loggingConfig.rotation;
        if (!rotation || !rotation.enabled || !rotation.checkIntervalHours) {
            return;
        }

        const intervalMs = rotation.checkIntervalHours * 60 * 60 * 1000;
        setInterval(() => {
            try {
                this.rotateLogFiles();
            } catch (error: any) {
                console.error('[LogRotation] Error during periodic rotation:', error.message);
            }
        }, intervalMs).unref(); // unref() so the timer doesn't prevent process exit
    }
}
