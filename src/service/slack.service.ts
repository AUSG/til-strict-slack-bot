import {WebClient} from "@slack/web-api";
import axios from "axios";
import Configuration from "../config/configuration";
import {Channel} from "../common/channels";

export default class SlackService {
    private slackClient: WebClient;
    private webhookUrl: string;

    constructor() {
        this.slackClient = new WebClient(Configuration.SLACK_BOT_TOKEN);
        this.webhookUrl = Configuration.TIL_SLACK_WEBHOOK_URL;
    }

    async sendMessage(channel: Channel, text: string): Promise<void> {
        try {
            console.log("Slack 메시지 전송:", channel, text);
            // await this.slackClient.chat.postMessage({
            //     channel,
            //     text,
            // });
        } catch (error) {
            console.error("Slack 메시지 전송 실패:", error);
            throw error;
        }
    }

    async sendTILNotification(message: string): Promise<void> {
        try {
            console.log("Slack 메시지 전송:", message);
            // await axios.post(this.webhookUrl, {text: message});
        } catch (error) {
            console.error("TIL Slack Webhook 전송 실패:", error);
            throw error;
        }
    }
}
