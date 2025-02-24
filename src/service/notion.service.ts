import {Client} from "@notionhq/client";
import Configuration from "../config/configuration";

export default class NotionService {
    private notionClient: Client;
    private databaseId: string;

    constructor() {
        this.notionClient = new Client({auth: Configuration.NOTION_API_KEY});
        this.databaseId = Configuration.TIL_NOTION_DATABASE_ID;
    }

    async getYesterdayTILWriter(): Promise<{id: string; user: string[]}[]> {
        try {
            const yesterday = this.getYesterday();

            const response = await this.notionClient.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: "날짜",
                    date: {equals: yesterday},
                },
            });

            return response.results.map((page: any) => ({
                id: page.id,
                user: page.properties.사람?.people?.map((user: any) => user.person.email) || [],
            }));
        } catch (error) {
            console.error("Notion 데이터 조회 실패:", error);
            throw error;
        }
    }

    private getYesterday(): string {
        const now = new Date();
        now.setDate(now.getDate() - 1);
        return now.toISOString().split("T")[0];
    }
}
