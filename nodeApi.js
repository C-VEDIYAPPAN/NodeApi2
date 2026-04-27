import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { parseString } from "xml2js";
import js2xmlparser from "js2xmlparser";
import dotenv from "dotenv";
import fs from "fs";
import https from "https";

dotenv.config({ path: "./Config.env" });

const app = express();
const port = process.env.PORT || 8080;

var MW_HEADER;

// 🔥 Logger
function log(level, message, extra = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...extra,
    })
  );
}

// 🔥 ENV LOG (IMPORTANT)
log("INFO", "ENV VARIABLES LOADED", {
  APIURLL: process.env.APIURLL,
  SEND_OTP_APIURL: process.env.SEND_OTP_APIURL,
  LD_APIURL: process.env.LD_APIURL,
  PORT: process.env.PORT,
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/statusCheck", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

function validateRequestBody(body) {
  const isValid = body && typeof body === "object" && Object.keys(body).length > 0;
  log("DEBUG", "Request Body Valid", { isValid });
  return isValid;
}

function splitJsonReq(json) {
  const jsonCopy = { ...json };
  const MwHeader = Object.keys(jsonCopy)[0];
  MW_HEADER = jsonCopy[MwHeader];
  delete jsonCopy[MwHeader];
  log("DEBUG", "Extracted MW_HEADER", { MW_HEADER });
  return jsonCopy;
}

function validateMWHeader(mwHeader) {
  const requiredFields = ["SessionID", "ServiceName", "RequestTime"];
  const missingFields = requiredFields.filter(
    (f) => !mwHeader[f] || mwHeader[f] === null
  );

  if (missingFields.length > 0) {
    log("ERROR", "Missing MW_HEADER fields", { missingFields });
    throw new Error(`Missing MW_HEADER fields: ${missingFields.join(", ")}`);
  }
}

app.post("/RestApi-call", async (req, res) => {
  log("INFO", "Incoming Request", { body: req.body });

  try {
    if (!validateRequestBody(req.body)) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const jsonReqBody = req.body;
    const header = Object.keys(jsonReqBody)[0];
    const { ServiceName } = jsonReqBody[header];

    log("INFO", "ServiceName Extracted", { ServiceName });

    let soapEndpoint;
    let xmlRequest;
    let contentType;

    switch (ServiceName) {
      case "SMS_OTP":
        soapEndpoint = process.env.SEND_OTP_APIURL;
        xmlRequest = splitJsonReq(req.body);
        contentType = "application/json";
        break;

      case "LDSimulationInquiry":
        soapEndpoint = process.env.LD_APIURL;
        xmlRequest = splitJsonReq(req.body);
        contentType = "application/json";
        break;

      case "GetLimits_Retail":
        soapEndpoint = process.env.GET_LIMITS_APIURL;
        xmlRequest = splitJsonReq(req.body);
        contentType = "application/json";
        break;

      case "RetrieveContact":
        soapEndpoint = process.env.RETRIEVE_CONTACT_APIURL;
        let bankUser = jsonReqBody[header]?.BankUser;
        let mobileNum = jsonReqBody[header]?.MobileNum;

        if (soapEndpoint?.includes("S_BANKUSER")) {
          soapEndpoint = soapEndpoint.replace("S_BANKUSER", bankUser);
        }
        if (soapEndpoint?.includes("S_MOBILENUM")) {
          soapEndpoint = soapEndpoint.replace("S_MOBILENUM", mobileNum);
        }

        xmlRequest = splitJsonReq(req.body);
        contentType = "application/json";
        break;

      default:
        log("ERROR", "Unsupported ServiceName", { ServiceName });
        throw new Error(`Unsupported ServiceName: ${ServiceName}`);
    }

    log("INFO", "Final SOAP Endpoint", { soapEndpoint });

    // 🔥 URL VALIDATION
    if (!soapEndpoint || !soapEndpoint.startsWith("http")) {
      log("ERROR", "Invalid URL detected", { soapEndpoint });
      throw new Error(`Invalid URL: ${soapEndpoint}`);
    }

    validateMWHeader(MW_HEADER);

    // 🔥 Certificate logs
    log("DEBUG", "Certificates", {
      cert: process.env.SERVERCERTIFICATE,
      key: process.env.SERVERPRIVATEKEY,
      ca: process.env.SERVERCRTCERTIFICATE,
    });

    const httpsAgent = new https.Agent({
      cert: fs.readFileSync(process.env.SERVERCERTIFICATE),
      key: fs.readFileSync(process.env.SERVERPRIVATEKEY),
      ca: fs.readFileSync(process.env.SERVERCRTCERTIFICATE),
      rejectUnauthorized: false,
    });

    log("DEBUG", "Outgoing API Request", {
      url: soapEndpoint,
      payload: xmlRequest,
    });

    const response = await axios.post(soapEndpoint, xmlRequest, {
      headers: { "Content-Type": contentType },
      httpsAgent,
      timeout: 20000,
    });

    log("INFO", "API Response", {
      status: response.status,
      data: response.data,
    });

    return res.status(200).json({
      MW_HEADER,
      data: response.data,
    });

  } catch (err) {
    log("ERROR", "Exception caught", {
      error: err.message,
      stack: err.stack,
    });

    if (axios.isAxiosError(err)) {
      log("ERROR", "Axios Error", {
        url: err.config?.url,
        request: err.config?.data,
        response: err.response?.data,
      });
    }

    return res.status(500).json({
      error: err.message,
    });
  }
});

app.listen(port, () => {
  log("INFO", `Server running on port ${port}`);
});