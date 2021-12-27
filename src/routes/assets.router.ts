import express, { json, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { collections } from "../services/database.service";
import { QueueScheduler, Worker } from "bullmq";
import { Queue } from "bullmq";
import { QueueEvents } from "bullmq";
import ScanJob from "../models/scanJob";
import { Asset } from "../models/asset";
import * as dotenv from "dotenv";

/**
 * General Notes:
 *  - Move express logic to seperate file
 *  - Move all configs to seperate files
 *  - Move querys to seperate files
 *  - Move logic to seperate files (services)
 *  - Rename unclear stuff
 *  - Prefer always use "const" over "let" if you don't need "let"
 *  - For logs do not use "console.log" prefer libraries like "winston" for example.
 *  - When using express you can use middlewares and hanlde errors in other ways
 *  - You can use "mongoose" much more readable code and easy to use.
 */

// Move to seperate file (express.ts)
export const assetsRouter = express.Router();
assetsRouter.use(express.json());

// This logic should not be in router.ts
dotenv.config();

// Move configs to config.ts
const MINUTE: number = 60000;
const SIXSECONDS: number = 6000; // FOR TESTS

/** 
 * Why you declare this const in this level?
 * NOTICE - it will be a shared object
 * The meaning of this object is not clear.
 * */
const filteredJobs: ScanJob[] = [];

// Not in use - remove
const myQueueScheduler = new QueueScheduler("foo");

// Clear names - example: const jobProcessorQueue = new Queue("job-processor-queue");
// Also remove this logic to another file and export queue to use.
const myQueue = new Queue("foo");

// addJob to where? also move this function to seperate file/service
// Example: assetService.addJob(params: { jobId: string; jobName: string; delayTime: number;});
async function addJob(jobId: string, jobName: string, delayTime: number) {
    await myQueue.add(jobName, { jobId: jobId }, { delay: delayTime * MINUTE });
}

// move to another file..
const worker = new Worker("foo", async (job) => {
    // console.log(job.data);
});

// Move to config file.
const key = process.env.AWS_ACCESS_KEY_ID;
const secret = process.env.AWS_SECRET_ACCESS_KEY;

assetsRouter.get("/:sort?", async (_req: Request, res: Response) => {
    const sort = _req?.params?.sort;
    // remove comments
    //console.log("sort value: " + sort);

    /**
     * 1. im not sure check it but I think you can create a query and append logic for example: 
     * let query = collections.assets.find();
     * if(sort) query = query.sort();
     * 
     * 2. What if you have 100,000 assets? Will you return all assets to client?
     *      2.1 you should implement pagination
     *      2.2 never return all assets to client
     * 3. Why you need to use assets.forEach, you are using mongodb.
     *      3.1 One way will be to add "ref" object and just to $lookup (like sql join)
     *      3.2 Save all scans as objects in mongodb (also called embed object)
     *      3.3 You can and NEED to fileter jobs from mongo, always think what will happened if you have 1M jobs.. will you fetch 1M docs to server? (You will get memory exception)
     * 4. You are using "filteredJobs" object. 
     *      4.1 This object is declared in process level, and it will be shared with all clients - VERY BAD
     */

    // What if we fail here? 
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

        // Not clear why this logic is here?
        let tempJobIdForQuery: string = "";
        // What if we fail? this wont support async function "addJob", and again why this logic is here?
        filteredJobs.forEach(function (scanJob) {
            tempJobIdForQuery = scanJob.id.valueOf().toString();
            addJob(
                tempJobIdForQuery,
                `job with id:${scanJob.id} dateCreated:${scanJob.dateCreated}`,
                scanJob.scanDueDate,
            );
        });

        // Move to seperate file/service
        let paramsSns: any = {
            Message: "scan_job_message",
            Subject: "scan_job_status",
            //TargetArn: "arn:aws:sqs:us-east-2:914740489788:Jobs-Done",
            TopicArn: "New-Scan-Job",
        };

        // Every time this route is called you add event listener? why?
        // This logic should not be here.. also its async.. 
        worker.on("completed", (job) => {
            let scanJobId: string = job.data.jobId;
            console.log(`${job.name} has completed!`);

            // You could use ref object and not use all this logic.
            // Also think what if we have 100K jobs or more?
            // This function is not async and will continue running, prefer always using "async"/"await"
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

        // This logic should not be here.. also its async.. 
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
        // move to service - assetService.findById();
        const query = { _id: new ObjectId(id) };
        const asset = (await collections.assets.findOne(query)) as Asset;

        // And what if this "if" is not valid? you will not get to "catch" and this function will hang.
        if (asset) {
            res.status(200).send(asset);
        }
    } catch (error) {
        res.status(404).send(`Unable to find matching document with id: ${req.params.id}`);
    }
});

assetsRouter.post("/", async (req: Request, res: Response) => {
    try {
        // What is the request body?
        // What about validations?
        const newAsset = req.body;
        newAsset.dateCreated = new Date();

        // Move to service
        // Names - result of what? insertOne should return the object so better name will be: const newAsset = 
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

// to add job use "POST" not "PUT"
assetsRouter.put("/:id/addScanJob", async (req: Request, res: Response) => {
    const id = req?.params?.id;

    try {
        const updatedAsset = req.body;
        const query = { _id: new ObjectId(id) };

        /**
         * You add new job at this route, 
         * So why you dont add job to queue at this point? what i'm missing here?
         */
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
