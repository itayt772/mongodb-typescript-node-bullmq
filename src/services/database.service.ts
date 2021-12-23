import * as mongoDB from "mongodb";
import * as dotenv from "dotenv";
import ScanJob from "../models/scanJob";
import { Asset } from "../models/asset";

export const collections: {
    assets?: mongoDB.Collection<Asset>;
} = {};

export async function connectToDatabase() {
    // Pulls in the .env file so it can be accessed from process.env. No path as .env is in root, the default location
    dotenv.config();

    // Create a new MongoDB client with the connection string from .env
    const client = new mongoDB.MongoClient(process.env.DB_CONN_STRING);

    // Connect to the cluster
    await client.connect();

    // Connect to the database with the name specified in .env
    const db = client.db(process.env.DB_NAME);

    // Apply schema validation to the collection
    await applySchemaValidation(db);

    // Connect to the collection with the specific name from .env, found in the database previously specified
    const assetsCollection = db.collection<Asset>(process.env.ASSET_COLLECTION_NAME);
    // Persist the connection to the Games collection
    collections.assets = assetsCollection;
    console.log(
        `Successfully connected to database: ${db.databaseName} and collection: ${assetsCollection.collectionName}`,
    );
}

async function applySchemaValidation(db: mongoDB.Db) {
    const jsonSchema = {
        $jsonSchema: {
            bsonType: "object",
            required: ["_id", "ip", "name", "dateCreated"],
            additionalProperties: false,
            properties: {
                _id: {},
                ip: {
                    bsonType: "string",
                    description: "'ip' is required and is a string",
                },
                name: {
                    bsonType: "string",
                    description: "'name' is required and is a string",
                },
                description: {
                    bsonType: "string",
                },
                dateCreated: {
                    bsonType: "date",
                    description: "'dateCreated' is required and is a date",
                },
                authors: {
                    bsonType: "Array",
                    required: ["fullName", "age"],
                    properties: {
                        id: {},
                        dateCreated: {
                            bsonType: "date",
                            description: "'dateCreated' is required and is a date",
                        },
                        scanDueDate: {
                            bsonType: "number",
                            description: "'scanDueDate' is required and is a number",
                        },
                        dateCompleted: {
                            bsonType: "date",
                            default: 0,
                        },
                        status: {
                            bsonType: "string",
                            description: "'status' is required and is a string",
                        },
                    },
                },
            },
        },
    };

    // Try applying the modification to the collection, if the collection doesn't exist, create it

    await db
        .command({
            collMod: process.env.ASSETS_COLLECTION_NAME,
            validator: jsonSchema,
        })
        .catch(async (error: mongoDB.MongoServerError) => {
            if (error.codeName === "NamespaceNotFound") {
                await db.createCollection(process.env.ASSETS_COLLECTION_NAME);
            }
        });
}
