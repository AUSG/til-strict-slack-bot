import Redis from "ioredis";
import Configuration from "../config/configuration";

export default class RedisService {
    private static instance: Redis;

    private constructor() {}

    static getInstance(): Redis {
        if (!this.instance) {
            this.instance = new Redis({
                host: Configuration.REDIS_HOST,
                port: Number(Configuration.REDIS_PORT),
            });

            this.instance.on("error", (err) => console.error("Redis Client Error", err));
        }

        return this.instance;
    }
}
