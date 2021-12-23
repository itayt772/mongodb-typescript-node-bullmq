import express, { json, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import { QueueScheduler, Worker } from "bullmq";
import { Queue } from "bullmq";
import { QueueEvents } from "bullmq";
import ScanJob from "../models/scanJob";
import { Asset } from "../models/asset";
import * as dotenv from "dotenv";

export const assetsRouter = express.Router();

assetsRouter.use(express.json());
dotenv.config();
const MINUTE: number = 60000;
const SIXSECONDS: number = 6000; // FOR TESTS
const filteredJobs: ScanJob[] = [];

const myQueueScheduler = new QueueScheduler("foo");
const myQueue = new Queue("foo");

async function addJob(jobId: string, jobName: string, delayTime: number) {
    await myQueue.add(jobName, { jobId: jobId }, { delay: delayTime * MINUTE });
}

const worker = new Worker("foo", async (job) => {
    // console.log(job.data);
});
const key = process.env.AWS_ACCESS_KEY_ID;
const secret = process.env.AWS_SECRET_ACCESS_KEY;

assetsRouter.get("/:sort?", async (_req: Request, res: Response) => {
    const sort = _req?.params?.sort;
    //console.log("sort value: " + sort);
    let assets: Asset[] = [];
    if (sort) {
        assets = await collections.assets.find({}).sort({ name: 1 }).toArray();
    } else {
        assets = await collections.assets.find({}).toArray();
    }
    try {
        assets.forEach(function (asset) {
            if (asset.scanJobs) {
                for (let i = 0; i < asset.scanJobs.length; i++) {
                    if (asset.scanJobs[i].scanDueDate > 0) {
                        filteredJobs.push(asset.scanJobs[i]); // push job into jobs array
                    }
                }
            }
        });

        let tempJobIdForQuery: string = "";
        filteredJobs.forEach(function (scanJob) {
            tempJobIdForQuery = scanJob.id.valueOf().toString();
            addJob(
                tempJobIdForQuery,
                `job with id:${scanJob.id} dateCreated:${scanJob.dateCreated}`,
                scanJob.scanDueDate,
            );
        });

        let paramsSns: any = {
            Message: "scan_job_message",
            Subject: "scan_job_status",
            //TargetArn: "arn:aws:sqs:us-east-2:914740489788:Jobs-Done",
            TopicArn: "New-Scan-Job",
        };

        worker.on("completed", (job) => {
            let scanJobId: string = job.data.jobId;
            console.log(`${job.name} has completed!`);

            collections.assets
                .updateOne(
                    {},
                    { $set: { "scanJobs.$[elem].status": "completed", "scanJobs.$[elem].dateCompleted": new Date() } },
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
            collections.assets
                .updateOne(
                    {},
                    { $set: { "scanJobs.$[elem].status": "failed" } },
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

        res.status(200).send(assets);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Example route: http://localhost:8080/assets/610aaf458025d42e7ca9fcd0
assetsRouter.get("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const asset = (await collections.assets.findOne(query)) as Asset;

        if (asset) {
            res.status(200).send(asset);
        }
    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

assetsRouter.post("/", async (req: Request, res: Response) => {
    try {
        const newAsset = req.body;
        newAsset.dateCreated = new Date();
        const result = await collections.assets.insertOne(newAsset);

        result
            ? res.status(201).send(`Successfully created a new asset with id ${result.insertedId}`)
            : res.status(500).send("Failed to create a new asset.");
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message);
    }
});

assetsRouter.put("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const updatedAsset = req.body;
        const query = { _id: new ObjectId(id) };
        // $set adds or updates all fields
        const result = await collections.assets.updateOne(query, { $set: updatedAsset });

        result
            ? res.status(200).send(`Successfully updated asset with id ${id}`)
            : res.status(304).send(`Asset with id: ${id} not updated`);
    } catch (error) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

// add scanjob
// Example route: http://localhost:8080/assets/610aaf458025d42e7ca9fcd0/addScanJob
assetsRouter.put("/:id/addScanJob", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const updatedAsset = req.body;
        const query = { _id: new ObjectId(id) };
        const result = await collections.assets.updateOne(query, {
            $push: {
                scanJobs: {
                    id: new ObjectId(),
                    dateCreated: new Date(),
                    scanDueDate: req.body.scanDueDate,
                    dateCompleted: null,
                    status: "pending",
                },
            },
        });

        result
            ? res.status(200).send(`Successfully added scan job with id ${id} to queue`)
            : res.status(304).send(`scan job not updated`);
    } catch (error) {
        console.error(error.message);
        res.status(400).send(error.message);
    }
});

assetsRouter.delete("/:id", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const query = { _id: new ObjectId(id) };
        const result = await collections.assets.deleteOne(query);

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
