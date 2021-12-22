import express, { json, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import { QueueScheduler, Worker } from "bullmq";
import { Queue } from "bullmq";
import { QueueEvents } from "bullmq";
import { env } from "process";
import config from "../config";
import ScanJob from "../models/scanJob";
import Game from "../models/game";
import Author from "../models/author";

export const gamesRouter = express.Router();

gamesRouter.use(express.json());

const MINUTE: number = 60000;
const SIXSECONDS: number = 6000; // FOR TESTS
const filteredJobs: Author[] = [];

const myQueueScheduler = new QueueScheduler("foo");
const myQueue = new Queue("foo");

async function addJob(jobId: string, jobName: string, delayTime: number) {
    await myQueue.add(jobName, { jobId: jobId }, { delay: delayTime * SIXSECONDS });
}

const worker = new Worker("foo", async (job) => {
    console.log(job.data);
});

gamesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const games = await collections.games.find({}).toArray();

        games.forEach(function (game) {
            for (let i = 0; i < game.authors.length; i++) {
                if (game.authors[i].scanJob > 0) {
                    filteredJobs.push(game.authors[i]); // push job into jobs array
                }
            }
        });

        let tempJobIdForQuery: string = "";
        filteredJobs.forEach(function (scanJob) {
            tempJobIdForQuery = scanJob.id.valueOf().toString();
            addJob(tempJobIdForQuery, `jobFromInside with id:${scanJob.id} name:${scanJob.fullName}`, scanJob.scanJob);
        });

        worker.on("completed", (job) => {
            let scanJobId: string = job.data.jobId;
            console.log(`${job.name} has completed!`);

            collections.games
                .updateOne(
                    {},
                    { $set: { "authors.$[elem].status": "completed" } },
                    { arrayFilters: [{ "elem.id": { $eq: new ObjectId(scanJobId) } }] },
                )
                .then((obj) => {
                    console.log("Updated - " + scanJobId);
                })
                .catch((err) => {
                    console.log("Error: " + err);
                });
        });

        worker.on("failed", (job, err) => {
            let scanJobId: string = job.data.jobId;
            collections.games
                .updateOne(
                    {},
                    { $set: { "authors.$[elem].status": "failed" } },
                    { arrayFilters: [{ "elem.id": { $eq: new ObjectId(scanJobId) } }] },
                )
                .then((obj) => {
                    console.log("Failed - " + scanJobId);
                })
                .catch((err) => {
                    console.log("Error: " + err);
                });
            console.log(`${job.id} has failed with ${err.message}`);
        });

        res.status(200).send(games); //gamesFindJobs
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Example route: http://localhost:8080/games/610aaf458025d42e7ca9fcd0
gamesRouter.get("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        // _id in MongoDB is an objectID type so we need to find our specific document by querying
        const query = { _id: new ObjectId(id) };
        const game = (await collections.games.findOne(query)) as Game;

        if (game) {
            res.status(200).send(game);
        }
    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

gamesRouter.post("/", async (req: Request, res: Response) => {
    try {
        const newGame = req.body;
        newGame.dateCreated = new Date();
        const result = await collections.games.insertOne(newGame);

        result
            ? res.status(201).send(`Successfully created a new game with id ${result.insertedId}`)
            : res.status(500).send("Failed to create a new game.");
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message);
    }
});

gamesRouter.put("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const updatedGame = req.body;
        const query = { _id: new ObjectId(id) };
        // $set adds or updates all fields
        const result = await collections.games.updateOne(query, { $set: updatedGame });

        result
            ? res.status(200).send(`Successfully updated game with id ${id}`)
            : res.status(304).send(`Game with id: ${id} not updated`);
    } catch (error) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

// add scanjob
// Example route: http://localhost:8080/games/610aaf458025d42e7ca9fcd0/addScanJob
gamesRouter.put("/:id/addScanJob", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const updatedGame = req.body; // put here new scanJob
        const query = { _id: new ObjectId(id) };
        // db.students.updateOne({ _id: 1 }, { $push: { scores: 89 } });
        // $set adds or updates all fields
        const result = await collections.games.updateOne(query, {
            $push: {
                authors: {
                    id: new ObjectId(),
                    fullName: req.body.fullName,
                    age: req.body.age,
                    scanJob: req.body.scanJob,
                    status: "pending",
                },
            },
        });

        result
            ? res.status(200).send(`Successfully updated asset with id ${id}`)
            : res.status(304).send(`Asset with id: ${id} not updated`);
    } catch (error) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

gamesRouter.delete("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const result = await collections.games.deleteOne(query);

        if (result && result.deletedCount) {
            res.status(202).send(`Successfully removed asset with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to remove asset with id ${id}`);
        } else if (!result.deletedCount) {
            res.status(404).send(`Asset with id ${id} does not exist`);
        }
    } catch (error) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});
