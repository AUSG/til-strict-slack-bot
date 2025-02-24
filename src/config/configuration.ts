export default class Configuration {
    private static getEnvVariable(key: string, defaultValue?: string): string {
        const value = process.env[key];
        if (value === undefined) {
            if (defaultValue !== undefined) {
                return defaultValue;
            }
            throw new Error(`${key}가 없습니다.`);
        }
        return value;
    }

    static readonly SLACK_BOT_TOKEN: string = Configuration.getEnvVariable("SLACK_BOT_TOKEN");
    static readonly TIL_SLACK_WEBHOOK_URL: string = Configuration.getEnvVariable("TIL_SLACK_WEBHOOK_URL");
    static readonly NOTION_API_KEY: string = Configuration.getEnvVariable("NOTION_API_KEY");
    static readonly TIL_NOTION_DATABASE_ID: string = Configuration.getEnvVariable("TIL_NOTION_DATABASE_ID");
    static readonly SECURITY_GROUP_ID: string = Configuration.getEnvVariable("SECURITY_GROUP_ID");
    static readonly SUBNET_ID_1: string = Configuration.getEnvVariable("SUBNET_ID_1");
    static readonly SUBNET_ID_2: string = Configuration.getEnvVariable("SUBNET_ID_2");
    static readonly REDIS_HOST: string = Configuration.getEnvVariable("REDIS_HOST");
    static readonly REDIS_PORT: string = Configuration.getEnvVariable("REDIS_PORT");
}
