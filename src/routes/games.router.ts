import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import { QueueScheduler, Worker } from "bullmq";
import { Queue } from "bullmq";
import { QueueEvents } from "bullmq";
import { env } from "process";
import config from "../config";
import ScanJob from "../models/scan-job";
import Game from "../models/game";
import Author from "../models/author";

export const gamesRouter = express.Router();

gamesRouter.use(express.json());

const MINUTE: number = 60000;
const SIXSECONDS: number = 6000; // FOR TESTS

let delayForJobFromGame = 0;
const myQueueScheduler = new QueueScheduler("foo");
const myQueue = new Queue("foo");

async function addJob(jobId: ObjectId, jobName: string, delayTime: number) {
    await myQueue.add(jobName, { foo: "bar" }, { delay: delayTime * SIXSECONDS });
}

async function addJobs() {
    await myQueue.add("myJobName", { foo: "bar" }, { delay: MINUTE });
    await myQueue.add("myJobName2", { qux: "baz" }, { delay: 5 });
    // await myQueue.add(
    //     "house",
    //     { color: "white" },
    //     {
    //         repeat: {
    //             every: 10000,
    //             limit: 10,
    //         },
    //     },
    // );
}

//addJobs();

const worker = new Worker("foo", async (job) => {
    // Will print { foo: 'bar'} for the first job
    // and { qux: 'baz' } for the second.
    console.log(job.data);
});

gamesRouter.get("/", async (_req: Request, res: Response) => {
    try {
        const games = await collections.games.find({}).toArray();
        // search in games in authors array if is there jobs to do
        // by seeing id scanjob val > 0
        //const gamesFindJobs = await collections.games.find({ "authors.scanJob": { $gte: 1 } }).toArray();
        const filteredJobs: Author[] = [];

        games.forEach(function (game) {
            for (let i = 0; i < game.authors.length; i++) {
                if (game.authors[i].scanJob > 0) {
                    filteredJobs.push(game.authors[i]); // push job into jobs array
                }
            }
            // let author = game.authors.find((x) => x.scanJob > 0);
            // filteredJobs.push(author);
        });
        console.log(filteredJobs);

        filteredJobs.forEach(function (scanJob) {
            addJob(scanJob.id, `jobFromInside with id:${scanJob.id} name:${scanJob.fullName}`, scanJob.scanJob);
        });

        worker.on("completed", (job) => {
            let scanId = job.id;
            console.log(`${job.id} ${job.name} has completed!`);
            //let state = await job.getState();
            // collections.games.findOneAndUpdate(
            //     { _id: "61c1dd0636c24fa1d95f046b", "authors.id": "61c1dd4e5198f9a65df8ff17" },
            //     { $inc: { "authors.$.scanJob": 5 } },
            // );

            collections.games
                .updateOne(
                    {},
                    { $set: { "authors.$[elem].status": "completed" } },
                    { arrayFilters: [{ "elem.age": { $gte: 35 } }] },
                )
                .then((obj) => {
                    console.log("Updated - " + obj);
                })
                .catch((err) => {
                    console.log("Error: " + err);
                });

            // collections.games
            //     .updateOne({ authors: { "authors.id": scanId } }, { $set: { "authors.$.status": "complete" } })
            //     .then((obj) => {
            //         console.log("Updated - " + obj);
            //     })
            //     .catch((err) => {
            //         console.log("Error: " + err);
            //     });

            //collections.games.

            // collections.games
            //     .updateOne(
            //         { _id: new ObjectId("61c1dd0636c24fa1d95f046b") }, // Filter
            //         { $set: { name: "Vladio" } }, // Update
            //         //{upsert: true} // add document with req.body._id if not exists
            //     )
            //     .then((obj) => {
            //         console.log("Updated - " + obj);
            //     })
            //     .catch((err) => {
            //         console.log("Error: " + err);
            //     });
        });

        worker.on("failed", (job, err) => {
            console.log(`${job.id} has failed with ${err.message}`);
        });

        // update status for job

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
                    fullName: "The new author3",
                    age: 32,
                    scanJob: 1,
                    status: "pending",
                },
            },
        });

        result
            ? res.status(200).send(`Successfully updated game with id ${id}`)
            : res.status(304).send(`Game with id: ${id} not updated`);
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
            res.status(202).send(`Successfully removed game with id ${id}`);
        } else if (!result) {
            res.status(400).send(`Failed to remove game with id ${id}`);
        } else if (!result.deletedCount) {
            res.status(404).send(`Game with id ${id} does not exist`);
        }
    } catch (error) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});
