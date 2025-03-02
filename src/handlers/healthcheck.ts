import Configuration from "../config/configuration";

export const handler = async (event: any) => {
    try {
        return {
            statusCode: 200,
            body: JSON.stringify({message: `${Configuration.SUCCESS_RUN_MESSAGE}`}),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({error: "Internal server error"}),
        };
    }
};
