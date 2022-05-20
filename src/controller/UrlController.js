const UrlModel = require('../Models/URLModel')
const validUrl = require('valid-url')
const redis = require("redis")
const { promisify } = require("util")
const { isValid, isValidBody } = require('../Validator/Validation')




/*----------------------------------------------------------- Connect to redis ---------------------------------------------------------*/


const redisClient = redis.createClient(
    12820,
    "redis-12820.c301.ap-south-1-1.ec2.cloud.redislabs.com",
    { no_ready_check: true }
);
redisClient.auth("HvFgITtV4oT7ci4l5fnMK4cvByV4alAG", function (err) {
    if (err) throw err;
});
redisClient.on("connect", async function () {
    console.log("Connected to Redis..");
});

const SET_ASYNC = promisify(redisClient.SET).bind(redisClient);
const GET_ASYNC = promisify(redisClient.GET).bind(redisClient);





/*----------------------------------------------------------- Post url/shorten ---------------------------------------------------------*/

const createUrl = async function (req, res) {
    try {
        const body = req.body
        // Validate body(body must be present)
        if (!isValidBody(body)) {
            return res.status(400).send({ status: false, msg: "Body must not be empty" })
        }

        // Validate query(it must not be present)
        const query = req.query;
        if (isValidBody(query)) {
            return res.status(400).send({ status: false, msg: "Invalid parameters. Query must not be present" });
        }

        // Validate params(it must not be present)
        const params = req.params;
        if (isValidBody(params)) {
            return res.status(400).send({ status: false, msg: "Invalid parameters. Params must not be present" })
        }

        // longUrl must be present in body
        let longUrl = body.longUrl
        if (!isValid(longUrl)) {
            return res.status(400).send({ status: false, msg: "Please provide longUrl" })
        }


        // Validation of longUrl
        if (!validUrl.isWebUri(longUrl)) {
            return res.status(400).send({ status: false, message: `longURL is not a valid URL` })
        }


        //getting the data from cache if present

        let check = await GET_ASYNC(`${longUrl}`)
        if (check) {
            let response = JSON.parse(check)
            console.log("data is from cache")
            return res.status(200).send({ status: true, data: response })
        }


        // if url is already present in db

        let url = await UrlModel.findOne({ longUrl }).select({ longUrl: 1, shortUrl: 1, urlCode: 1, _id: 0 })
        if (url) {
            await SET_ASYNC(`${longUrl}`, JSON.stringify(url))
            console.log("data is from mongodb")
            return res.status(200).send({ status: true, msg: "Cached Url", data: url })
        }


        const baseUrl = 'http://localhost:3000/'
        // Validation of baseUrl
        if (!validUrl.isUri(baseUrl)) {
            return res.status(401).send({ status: false, msg: "Invalid baseUrl" })
        }

        const urlCode = (Math.random() + 1).toString(36).substring(7);

        // To create shortUrl from longUrl. We have to combine baseUrl with the urlCode.
        const shortUrl = baseUrl + urlCode.toLowerCase()


        let input = { longUrl, shortUrl, urlCode }

        const finalurl = await UrlModel.create(input)
        const createdUrl = { longUrl: finalurl.longUrl, shortUrl: finalurl.shortUrl, urlCode: finalurl.urlCode }

        await SET_ASYNC(`${input}`, JSON.stringify(finalurl))
        console.log("Data stored in DB")
        return res.status(201).send({ status: true, data: createdUrl })

    }
    catch (err) {
        console.log("This is the error :", err.message)
        return res.status(500).send({ status: false, msg: err.message })
    }
}

module.exports.createUrl = createUrl








/*----------------------------------------------------------- GET /:urlCode ---------------------------------------------------------*/

const getUrl = async function (req, res) {
    try {
        // Validate body(it must not be present)
        if (isValidBody(req.body)) {
            return res.status(400).send({ status: false, msg: "Body should not be present" })
        }

        // Validate query(it must not be present)
        const query = req.query;
        if (isValidBody(query)) {
            return res.status(400).send({ status: false, msg: "Invalid parameters. Query must not be present" });
        }

        const urlCode = req.params.urlCode
        // Validate params(it must be present)
        if (!isValid(urlCode.trim().toLowerCase())) {
            return res.status(400).send({ status: false, msg: "Please provide urlCode" })
        }

        else {
            let cache = await GET_ASYNC(`${urlCode}`);
            if (cache) {
                console.log("stored data pulled from cache.")
                return res.status(302).redirect(JSON.parse(cache))
            }
            else {
                const url = await UrlModel.findOne({ urlCode: urlCode })
                if (url) {
                    console.log("stored data pulled from DB")
                    await SET_ASYNC(`${urlCode}`, JSON.stringify(url.longUrl))
                    return res.status(302).redirect(url.longUrl);
                } else {
                    return res.status(404).send({ status: false, msg: "No urlCode matches" })
                }
            }
        }


    }
    catch (err) {
        console.log("This is the error :", err.message)
        return res.status(500).send({ status: false, msg: err.message })
    }
}

module.exports.getUrl = getUrl