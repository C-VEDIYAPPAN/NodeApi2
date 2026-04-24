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
const port = process.env.PORT || 8080; // Default to 8080 if PORT is not set

var MW_HEADER;

// --- JSON Logger Utility --- //
function log(level, message, extra = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra,
  };
  console.log(JSON.stringify(logEntry));
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Health check endpoints --- //
app.get("/statusCheck", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Utility: Validate request body
function validateRequestBody(body) {
  const isValid =
    body && typeof body === "object" && Object.keys(body).length > 0;
  log("DEBUG", "Request Body Valid", { isValid });
  return isValid;
}

// Utility: Convert JSON to XML
function convertJsonToXml(json) {
  try {
    const MwHeader = Object.keys(json)[0];
    MW_HEADER = json[MwHeader];
    const rootTag = Object.keys(json)[1];
    log("DEBUG", "Root tag", { rootTag });
    const innerJson = json[rootTag];
    const xml = js2xmlparser
      .parse(rootTag, innerJson)
      .replace(/<(\w+)([^>]*)\/>/g, "<$1$2></$1>");
    log("DEBUG", "Converted JSON to XML", { xml });
    return xml;
  } catch (err) {
    log("ERROR", "JSON to XML conversion failed", { error: err.message });
    throw new Error(
      "Failed to convert JSON to XML (or) Missing Middle Ware Header"
    );
  }
}

// Validate the header has all the required parameters
function validateMWHeader(mwHeader) {
  const requiredFields = ["SessionID", "ServiceName", "RequestTime"];
  const missingFields = requiredFields.filter(
    (field) => !mwHeader[field] || mwHeader[field] === null
  );

  if (missingFields.length > 0) {
    log("ERROR", "Missing required MW_HEADER fields", { missingFields });
    throw new Error(
      `Missing required MW_HEADER fields: ${missingFields.join(", ")}`
    );
  }
  log("DEBUG", "MW_HEADER validation passed");
}

// Utility: Convert XML to JSON
function convertXmlToJson(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false }, (err, result) => {
      if (err) {
        log("ERROR", "Failed to parse XML to JSON", { error: err.message });
        return reject(new Error("Failed to parse XML response"));
      }
      log("DEBUG", "Parsed XML to JSON", { result });
      resolve(result);
    });
  });
}

// Utility: Split MW And Ajman JSON req
function splitJsonReq(json) {
  try {
    // Create a copy of the original json object
    const jsonCopy = { ...json };
    const MwHeader = Object.keys(jsonCopy)[0];
    MW_HEADER = jsonCopy[MwHeader];
    
    // Delete MwHeader from the copy
    delete jsonCopy[MwHeader];
    
    log("DEBUG", "Extracted MW_HEADER", { MW_HEADER });
    log("DEBUG", "Remaining JSON request", { jsonCopy });
    
    return jsonCopy;
  } catch (err) {
    log("ERROR", "Split MW And Ajman JSON req failed", { error: err.message });
    throw new Error("Failed to Split MW And Ajman JSON req (or) Missing Middle Ware Header");
  }
}

// --- Main API Endpoint --- //
app.post("/RestApi-call", async (req, res) => {
  log("INFO", "Incoming Request Received");
  try {

    if (!validateRequestBody(req.body)) {
      log("WARN", "Invalid or empty JSON body");
      return res.status(400).json({ error: "Invalid or empty JSON body" });
    }
    
    const jsonReqBody = req.body;
    const header = Object.keys(jsonReqBody)[0];
    const { ServiceName } = jsonReqBody[header];
    log("DEBUG", "Service Name:", { ServiceName });
    const apitimeout = process.env[`${ServiceName}_TIMEOUT`] || process.env.COMMON_TIMEOUT;
    log("DEBUG", "API Timeout : ", { apitimeout });

    // Add switch case for different services
    let soapEndpoint;
    let xmlRequest;
    let contentType;
    let bankUser;
    let mobileNum;
    switch (ServiceName) {
        case 'SMS_OTP':
            soapEndpoint = process.env.SEND_OTP_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        
        case 'LDSimulationInquiry':
            soapEndpoint = process.env.LD_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'GetLimits_Retail':
            soapEndpoint = process.env.GET_LIMITS_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'GetRestrictions_Retail':
            soapEndpoint = process.env.GET_RESTRICTIONS_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'SwitchRestrictions_Retail':
            soapEndpoint = process.env.SWITCH_RESTRICTIONS_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'UpdateLimits_Retail':
            soapEndpoint = process.env.UPDATE_LIMITS_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'BeneBillerList':
            soapEndpoint = process.env.BEN_BILLER_LIST_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'GetCustomerLimit':
            soapEndpoint = process.env.GET_CUSTOMER_LIMIT_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'UpdateCustomerTxnLimit':
            soapEndpoint = process.env.UPDATE_CUSTOMER_TXN_LIMIT_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'PaymentRoutingCheck':
            soapEndpoint = process.env.PAYMENT_ROUTING_CHECK_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'PaymentStatusPS':
            soapEndpoint = process.env.PAYMENT_STATUS_PS_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'NPSSCharges':
            soapEndpoint = process.env.NPSS_CHARGES_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'OutwardPayment':
            soapEndpoint = process.env.OUTWARD_PAYMENT_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'PostingStatusCheck':
            soapEndpoint = process.env.POSTING_STATUS_CHECK_APIURL;
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'RetrieveContact':
            soapEndpoint = process.env.RETRIEVE_CONTACT_APIURL;
            bankUser = jsonReqBody[header]?.BankUser;
            log("DEBUG", "S_BANKUSER :", bankUser);
            mobileNum = jsonReqBody[header]?.MobileNum;
            log("DEBUG", "S_MOBILENUM :", mobileNum);
            if (soapEndpoint && soapEndpoint.includes("S_BANKUSER")) {
            soapEndpoint = soapEndpoint.replace("S_BANKUSER", bankUser);
            log("INFO", "soapEndpoint post replaced S_BANKUSER ", { soapEndpoint });
            }
            if (soapEndpoint && soapEndpoint.includes("S_MOBILENUM")) {
            soapEndpoint = soapEndpoint.replace("S_MOBILENUM", mobileNum );
            log("INFO", "soapEndpoint post replaced S_MOBILENUM ", { soapEndpoint });
            }
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'VerifyPayment':
            soapEndpoint = process.env.VERIFY_PAYMENT_APIURL;
            bankUser = jsonReqBody[header]?.BankUser; 
            log("DEBUG", "S_BANKUSER :", bankUser);
            if (soapEndpoint && soapEndpoint.includes("S_BANKUSER")) {
            soapEndpoint = soapEndpoint.replace("S_BANKUSER", bankUser);
            log("INFO", "soapEndpoint post replaced S_BANKUSER ", { soapEndpoint });
            }
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        case 'ConfirmPayment':
            soapEndpoint = process.env.CONFIRM_PAYMENT_APIURL;
            bankUser = jsonReqBody[header]?.BankUser; 
            log("DEBUG", "S_BANKUSER :", bankUser);
            if (soapEndpoint && soapEndpoint.includes("S_BANKUSER")) {
            soapEndpoint = soapEndpoint.replace("S_BANKUSER", bankUser);
            log("INFO", "soapEndpoint post replaced S_BANKUSER ", { soapEndpoint });
            }
            xmlRequest = splitJsonReq(req.body);
            contentType = "application/json";
            break;
        default:
          soapEndpoint = process.env.APIURLL;
          xmlRequest = convertJsonToXml(req.body);
          contentType = "text/xml;charset=UTF-8";
          break;
    }
    log("DEBUG", "SOAP Endpoint:", { soapEndpoint });
    validateMWHeader(MW_HEADER);
    
    // Load certificates for mutual TLS
    const httpsAgent = new https.Agent({
      cert: fs.readFileSync(process.env.SERVERCERTIFICATE),
      key: fs.readFileSync(process.env.SERVERPRIVATEKEY),
      ca: fs.readFileSync(process.env.SERVERCRTCERTIFICATE),
      rejectUnauthorized: false,
    });

    // Build request headers with service-specific overrides
    const baseHeaders = {
      "Content-Type": contentType,
    };

    const serviceSpecificHeaders = (() => {
      switch (ServiceName) {
        case "RetrieveContact":
          return {
            "X-Request-ID": jsonReqBody[header]?.["X-Request-ID"],
          };
        case "VerifyPayment":
          return {
            "X-Request-ID": jsonReqBody[header]?.["X-Request-ID"],
            "appId": jsonReqBody[header]?.appId,
          };
        case "ConfirmPayment":
          return {
            "X-Request-ID": jsonReqBody[header]?.["X-Request-ID"],
            "appId": jsonReqBody[header]?.appId,
            "authorizationType": jsonReqBody[header]?.authorizationType,
          };
        default:
          return {};
      }
    })();

    // merge and remove undefined/null values
    const headers = { ...baseHeaders, ...serviceSpecificHeaders };
    Object.keys(headers).forEach((k) => {
      if (headers[k] === undefined || headers[k] === null || headers[k] === "") {
        delete headers[k];
      }
    });
    
    log("DEBUG", "Final Request Headers", { headers });

    // Make the API request 
    const response = await axios.post(soapEndpoint, xmlRequest, {
      headers,
      httpsAgent,
      timeout: apitimeout,
    });

    log("INFO", "Certificate validation successful");

    log("DEBUG", "API Response", {
      status: response.status,
      body: response.data,
    });

    if (!response.data) {
      log("ERROR", "Empty response from API service");
      return res.status(502).json({ error: "Empty response from API service" });
    }

    let jsonResult;
    switch (ServiceName) {
        case 'SMS_OTP':
            jsonResult = response.data;
            break;
        case 'LDSimulationInquiry':
            jsonResult = response.data;
            break;
        case 'GetLimits_Retail':
            jsonResult = response.data;
            break;
        case 'GetRestrictions_Retail':
            jsonResult = response.data;
            break;
        case 'SwitchRestrictions_Retail':
            jsonResult = response.data;
            break;
        case 'UpdateLimits_Retail':
            jsonResult = response.data;
            break;
        case 'BeneBillerList':
            jsonResult = response.data;
            break;
        case 'GetCustomerLimit':
            jsonResult = response.data;
            break;
        case 'UpdateCustomerTxnLimit':
            jsonResult = response.data;
            break;
        case 'PaymentRoutingCheck':
            jsonResult = response.data;
            break;
        case 'PaymentStatusPS':
            jsonResult = response.data;
            break;
        case 'NPSSCharges':
            jsonResult = response.data;
            break;
        case 'OutwardPayment':
            jsonResult = response.data;
            break;
        case 'PostingStatusCheck':
            jsonResult = response.data;
            break;
        case 'RetrieveContact':
            jsonResult = response.data;
            break;
        case 'VerifyPayment':
            jsonResult = response.data;
            break;
        case 'ConfirmPayment':
            jsonResult = response.data;
            break;
        default:
           jsonResult = await convertXmlToJson(response.data);
          break;
    }
   
    const AfterHeaderAdd = {
      MW_HEADER,
      ...jsonResult,
    };

    log("INFO", "Successfully processed API request");
    res.status(200).json(AfterHeaderAdd);
  } catch (err) {
    log("ERROR", "Exception caught", { error: err.message, stack: err.stack });

    // Detect certificate errors and print details
    if (
      err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      err.code === "SELF_SIGNED_CERT_IN_CHAIN" ||
      (err.message &&
        (err.message.includes("self-signed certificate") ||
          err.message.includes("unable to verify the first certificate") ||
          err.message.includes("certificate")))
    ) {
      log("ERROR", "Certificate validation failed", { error: err.message });
      return res.status(502).json({
        error: "Certificate validation failed",
        message: err.message,
      });
    }

    if (axios.isAxiosError(err)) {
      log("ERROR", "Axios Error Response", {
        error: err.response?.data || err.message,
        details: err,
      });
      return res.status(502).json({
        error: "API service call failed",
        message: err.response?.data || err.message,
      });
    }

    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// Start HTTP server
app.listen(port, () => {
  console.log(
    `[INFO] Successfully HTTP Server is running at <=> http://localhost:${port}`
  );
});
