import express from "express";
import { connectToDatabase } from "./services/database.service";
import { assetsRouter } from "./routes/assets.router";

const app = express();
const port = 9000; // default port to listen

connectToDatabase()
    .then(() => {
        app.use("/assets", assetsRouter);
        // start the Express server
        app.listen(port, () => {
            console.log(`Server started at http://localhost:${port}`);
        });
    })
    .catch((error: Error) => {
        console.error("Database connection failed", error);
        process.exit();
    });
