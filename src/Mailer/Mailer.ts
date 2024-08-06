import Nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";
import FakeMailSendingException from "../Exceptions/Mailer/FakeMailSendingException";
import MailSendingException from "../Exceptions/Mailer/MailSendingException";
import TestAccountCreationException from "../Exceptions/Mailer/TestAccountCreationException";
import IOC from "../ServiceProviders/IOC";
import LoggerService from "../Services/Logger/LoggerService";

export default class Mailer {

    private static instance: Mailer;
    private client: Nodemailer.Transporter;
    private dryrun: boolean = false;
    private loggerService: LoggerService;

    /**
     * Initialize
     */
    private async initialize(): Promise<void> {
        // Get logger service
        this.loggerService = IOC.make(LoggerService) as LoggerService;

        // Get smtp config
        const smtpConfig = require(process.cwd() + '/build/config/mailer').default;

        // Check if dryrun is set to true
        if (smtpConfig.dryrun) {
            // Logger
            this.loggerService.info('Mailer dryrun mode is active... No emails would be sent');

            // Set dryrun to true
            this.dryrun = true;

            try {
                // Obtain smtp test account
                const testAccount = await Nodemailer.createTestAccount();

                // Logger
                this.loggerService.info('Test SMTP account obtained successfully', testAccount);

                // Instantiate test mail client
                this.client = Nodemailer.createTransport({
                    host: testAccount.smtp.host,
                    port: testAccount.smtp.port,
                    secure: testAccount.smtp.secure,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass
                    }
                });
            } catch (error) {
                throw new TestAccountCreationException(`Test SMTP account creation failed, ${error.message}`);
            }
        } else {
            // Instantiate mail client
            this.client = Nodemailer.createTransport(smtpConfig.smtp);
        }
    }

    /**
     * Sends email
     */
    public static async sendMail(mailOptions: Mail.Options): Promise<any> {
        // First of all check if instance of mailer was already instantiated
        // If not instantiate it
        if (!Mailer.instance) {
            Mailer.instance = new Mailer();
            await Mailer.instance.initialize();
        }

        // Send fake email
        if (Mailer.instance.dryrun) {
            try {
                // Logger
                Mailer.instance.loggerService.info('Preparing to send fake email');

                // Send fake email
                const sendMailResponse = await Mailer.instance.client.sendMail(mailOptions);

                // Logger
                Mailer.instance.loggerService.info('Fake email was sent successfully', { messageId: sendMailResponse.messageId });
                Mailer.instance.loggerService.info(`Fake email link generated, ${Nodemailer.getTestMessageUrl(sendMailResponse)}`);

                return sendMailResponse;
            } catch (error) {
                throw new FakeMailSendingException(`Sending fake email failed, ${error.message}`);
            }
        }

        // Send production email
        try {
            const sendMailResponse = await Mailer.instance.client.sendMail(mailOptions);
            return sendMailResponse;
        } catch (error) {
            throw new MailSendingException(`Sending email failed, ${error.message}`);
        }
    }
}
