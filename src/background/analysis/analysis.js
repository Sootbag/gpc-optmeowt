/*
OptMeowt is licensed under the MIT License
Copyright (c) 2021 Kuba Alicki, Stanley Markman, Oliver Wang, Sebastian Zimmeck
Previous contributors: Kiryl Beliauski, Daniel Knopf, Abdallah Salia
privacy-tech-lab, https://privacytechlab.org/
*/


/*
analysis.js
================================================================================
analysis.js 

Overall we have one goal with this script: Run an analysis on a page.
In order to do this, we will have the following functionality:

- Check the result of a __uspapi call exposed through the window object
- Check for a usprivacy cookie
- Check for usprivacy strings in URLs
- Check for usprivacy strings in HTTP headers

We will ultimately do this in the following order: 

(1) Load a page and check for a usprivacy string
(2) Send a GPC signal to the site and reload
(3) Check for any updated usprivacy strings
(4) Compile into a resulting analysis breakdown

This can potentially extend into other privacy flags into the future. A more 
direct task nearer to the immediate future is to check how CMP (OneTrust, etc.)
sites handle opt-out cookies and how they track in accordance with sending a 
GPC signal to a site that also has/does not have usprivacy strings. 
*/


import { modes } from "../../data/modes.js";
import { defaultSettings } from "../../data/defaultSettings.js";
import { stores, storage } from "./../storage.js";
// import { debug } from "webpack";
import psl from "psl";
import { onBeforeSendHeaders } from "../protection/events.js";
import { IS_BROWSER } from "../../theme/darkmode.js";
import { headers } from "../../data/headers"
import { popperOffsets } from "@popperjs/core";



/******************************************************************************/
/******************************************************************************/
/**********             # Initializers (cached values)               **********/
/******************************************************************************/
/******************************************************************************/


var analysis = {};
var urlFlags;
// var hasReloaded = false;

// var domainlist = {};    // Caches & mirrors domainlist in storage
// var mode = defaultSettings["MODE"]; // Caches the extension mode
// var isDomainlisted = defaultSettings["IS_DOMAINLISTED"];
// var tabs = {};          // Caches all tab infomration, i.e. requests, etc. 
// var wellknown = {};     // Caches wellknown info to be sent to popup
// var signalPerTab = {};  // Caches if a signal is sent to render the popup icon
// var activeTabID = 0;    // Caches current active tab id
// var sendSignal = true;  // Caches if the signal can be sent to the curr domain


var sendingGPC = false;
var changingSitesOnAnalysis = false;
var changingSitesOnUserRequest = false;  // used to create new analysis section
// use this to bump all teh variables up one


/*

Analysis object prototype structure

var analysis = {
  "wired.com": {  // DOMAIN LEVEL
    0: {
      "BEFORE_GPC": {  // All of the info here will be scraped if privacy flag found
        "COOKIES": {
          "usprivacy": {
            domain: "www.wired.com",
            expirationDate: 1663019064,
            firstPartyDomain: "",
            hostOnly: true,
            httpOnly: false,
            name: "usprivacy",
            path: "/",
            sameSite: "lax",
            secure: false,
            session: false,
            storeId: "firefox-default",
            value: "1---"
          }
        },
        "DO_NOT_SELL_LINK_EXISTS": false,
        "HEADERS": {},
        "URLS": {},
        "USPAPI": {
          "uspString": {
            uspString: "1---",
            version: 1
          }
        },
        "USPAPI_LOCATOR": {}, // Not sure if we need this here
        "THIRD_PARTIES": {
          // 'RECURSIVE' 2nd DOMAIN LEVEL
          "https://eus.rubiconproject.com/usync.html?us_privacy=1---": {
            0: {
              "BEFORE_GPC": {
                "COOKIES": {},
                "HEADERS": {},
                "URLS": {
                  "us_privacy": "1---"
                },
                "USPAPI": {},
                "USPAPI_LOCATOR": {}
              }, 
              "AFTER_GPC": {
                ...
              }
            }
          }
        }
      },
      "AFTER_GPC": {
        ...
      }
    },
    1: {
      ...
    }
  }
}

{
  "accuweather.com": 
    "FIRST_USP": "1YNN",
    "FIRST_USP_BOOL": false,
    "GPC_SENT": true,
    "SECOND_USP": "1YYN",
    "SECOND_USP_BOOL": "true",
    "RESULT": ,
    "CONFLICTS": 
}


var analysis = {
  "wired.com": [  // DOMAIN LEVEL
    {
      "TIMESTAMP": {},
      "BEFORE_GPC": {  // All of the info here will be scraped if privacy flag found
        "COOKIES": {
          "usprivacy": {
            domain: "www.wired.com",
            expirationDate: 1663019064,
            firstPartyDomain: "",
            hostOnly: true,
            httpOnly: false,
            name: "usprivacy",
            path: "/",
            sameSite: "lax",
            secure: false,
            session: false,
            storeId: "firefox-default",
            value: "1---"
          }
        },
        "DO_NOT_SELL_LINK_EXISTS": false,
        "HEADERS": {},
        "URLS": {},
        "USPAPI": {
          "uspString": {
            uspString: "1---",
            version: 1
          }
        },
        "USPAPI_LOCATOR": {}, // Not sure if we need this here
        "THIRD_PARTIES": {
          "https://eus.rubiconproject.com/usync.html?us_privacy=1---": 
          [
            {
              "BEFORE_GPC": {
                "COOKIES": {},
                "HEADERS": {},
                "URLS": { "us_privacy": "1---" },
                "USPAPI": {},
                "USPAPI_LOCATOR": {}
              }, 
              "AFTER_GPC": { ... }
            }
          ]
        }
      },
      "AFTER_GPC": { ... }
    }
  ]
}

*/


/******************************************************************************/
/******************************************************************************/
/**********                  # Stanley's functions                   **********/
/******************************************************************************/
/******************************************************************************/


/**
 * 
 * @returns 
 */
function loadFlags() {
  var urlFlags = [];
  //Load the privacy flags from the static json file
  fetch(chrome.extension.getURL('/data/privacy_flags.json'))
    .then((resp) => resp.json())
    .then(function (jsonData) {
      console.log("flagdata" + JSON.stringify(jsonData));
      flagObject = jsonData;
      console.log("FLAGONE" + jsonData.flags[0].name);
      flagObject.flags.forEach(flag => {
        urlFlags.push(flag.name);
      });
      console.log("URLFLAGS" + urlFlags);
    });
    return urlFlags;
}

// 1: details 2: did we privatize this request?
// Firefox implementation for fingerprinting classification flags
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeSendHeaders
/**
 * 
 * @param {*} details 
 * @param {*} privatized 
 * @returns 
 */
function processTrackingRequest (details, privatized){
  var urlFlags = loadFlags();

  debug.log("Fingerprinting request recieved")
  if (details.urlClassification != null) {
    // await storage.set(stores.analysis,details.documentURL,true);
    storage.set(stores.analysis,details.documentURL,true); 
    debug.log("Fingerprinting request recieved")
    debug.log(details.urlClassification)

    var settingsdict = parseURLForSignal(details.documentURL)
    //parse header
    for (let header of e.requestHeaders) {
      if (header.name.toLowerCase() in urlFlags) {
        // flag was in header
      }
    }

  }
  return details
}

/**
 * 
 * @param {*} url 
 * @returns 
 */
function parseURLForSignal(url) {
  var flagSettingsDict = [];

  //Unescape the URL strip off everything until the parameter bit 
  // (anything after the question mark)
  url = unescape(url);
  url = url.substring(url.indexOf("\?"));
  if (url.length == 0) {
    return;
  }

  var params = new URLSearchParams(url);

  urlFlags.forEach(flag => {
    if (params.has(flag)) {
      flagSettingsDict[flag] = params.get(flag);
    }
  });

  return flagSettingsDict;
}



/******************************************************************************/
/******************************************************************************/
/**********                       # Functions                        **********/
/******************************************************************************/
/******************************************************************************/


// Listener parameters for webRequest & webNavigation
const MOZ_REQUEST_SPEC = ["requestHeaders", "blocking"];
const MOZ_RESPONSE_SPEC = ["responseHeaders", "blocking"];
const FILTER = { urls: ["<all_urls>"] };

let newIncognitoTab = chrome.windows.create({ "url": null, "incognito": true });

// /us-?_?privacy/g;
let cookiesRegex = new RegExp([
  /(us-?_?privacy)|/,
  /(OptanonConsent)/
].map(r => r.source).join(''), "gmi");

console.log(cookiesRegex);


function addHeaders(details) {
  for (let signal in headers) {
    let s = headers[signal]
    details.requestHeaders.push({ name: s.name, value: s.value })
  }
  return { requestHeaders: details.requestHeaders }
}

/**
 * Initializes the analysis with a refresh after being triggered
 */
function runAnalysis() {
  // console.log("Reloading site, sendingGPC =", sendingGPC);
  sendingGPC = true;
  changingSitesOnAnalysis = true;
  addGPCHeaders();
  chrome.tabs.reload();
}

function disableAnalysis() {
  // console.log("DISABLING ANALYSIS, REMOVING GPC HEADERS")
  sendingGPC = false;
  changingSitesOnAnalysis = false;
  removeGPCHeaders();
}

/**
 * Runs `dom.js` to attach DOM signal
 * @param {object} details - retrieved info passed into callback
 */
 function addDomSignal(details) {
  chrome.tabs.executeScript(details.tabId, {
    file: "dom.js",
    frameId: details.frameId, // Supposed to solve multiple injections
                              // as opposed to allFrames: true
    runAt: "document_start",
  });
}

/**
 * https://developer.chrome.com/docs/extensions/reference/history/#transition_types 
 * @param {transitionType} transition 
 * @returns bool
 */
 function isValidTransition(transition) {
  return (transition === "link"
    || transition === "typed"
    || transition === "generated"
    || transition === "reload"
    || transition === "keyword"
    || transition === "keyword_generated" // Potentially unneeded
  );
}

/**
 * Returns url domain: String
 * @param {String} url 
 */
 function parseURL(url) {
  let urlObj = new URL(url);
  return (psl.parse(urlObj.hostname)).domain;
}


var analysisDataSkeletonThirdParties = () => {
  return {
    "TIMESTAMP": null,
    "COOKIES": [],
    "HEADERS": {},
    "URLS": {},
    "USPAPI": [],
    "USPAPI_LOCATOR": {}
  }
}

var analysisDataSkeletonFirstParties = () => { 
  return {
    "BEFORE_GPC": {
      "TIMESTAMP": null,
      "COOKIES": [],
      "DO_NOT_SELL_LINK_EXISTS": null,
      "HEADERS": {},
      "URLS": {},
      "USPAPI": [],
      "USPAPI_LOCATOR": {},
      "THIRD_PARTIES": {}
    },
    "AFTER_GPC": {
      "TIMESTAMP": null,
      "COOKIES": [],
      "DO_NOT_SELL_LINK_EXISTS": null,
      "HEADERS": {},
      "URLS": {},
      "USPAPI": [],
      "USPAPI_LOCATOR": {},
      "THIRD_PARTIES": {}
    },
    "SENT_GPC": null
  }
}

/**
 * 
 * @param {Object} data 
 * Parameters - type: STRING, data: ANY
 */
function logData(domain, command, data) {
  let gpcStatusKey = sendingGPC ? "AFTER_GPC" : "BEFORE_GPC";
  // let gpcStatusKey = changingSitesOnUserRequest ? "BEFORE_GPC" : "AFTER_GPC";

  if (!analysis[domain]) {
    // console.log("Adding analysis[domain] = [];")
    analysis[domain] = [];
  }
  let callIndex = analysis[domain].length;
  // console.log("call index: ", callIndex)

  // FIX TEH USE CASE HERE FOR ARRAYS

  if (changingSitesOnUserRequest) {
    analysis[domain][callIndex] = analysisDataSkeletonFirstParties();
    changingSitesOnUserRequest = false;
  } else {
    callIndex -= 1;
    // console.log("Saving to minus one callindex", callIndex)
    // console.log("(4) analysis: ", analysis);
  }

  if (!analysis[domain][callIndex][gpcStatusKey]["TIMESTAMP"]) {
    let ms = Date.now();
    analysis[domain][callIndex][gpcStatusKey]["TIMESTAMP"] = ms; 
  }

  if (sendingGPC) {
    analysis[domain][callIndex]["SENT_GPC"] = true;
  }

  // Let's assume that data does have a name property as a cookie should
  if (command === "COOKIES") {
    analysis[domain][callIndex][gpcStatusKey]["COOKIES"].push(data);
    // console.log("Got to COMMAND === COOKIES");

    // Make a new enumerated section under the particular domain
    // otherwise use the last one
  }
  if (command === "USPAPI") {
    // console.log("Got to COMMAND === USPAPI");
    analysis[domain][callIndex][gpcStatusKey]["USPAPI"].push(data);
  }
  console.log("Updated analysis logs: ", analysis);
}



/******************************************************************************/
/******************************************************************************/
/**********                       # Listeners                        **********/
/******************************************************************************/
/******************************************************************************/


var addGPCHeaders = function() {
  sendingGPC = true;
  chrome.webRequest.onBeforeSendHeaders.addListener(
    addHeaders,
    FILTER,
    MOZ_REQUEST_SPEC
);}

var removeGPCHeaders = function() {
  sendingGPC = false;
  chrome.webRequest.onBeforeSendHeaders.removeListener(addHeaders);
}

// Cookie listener - grabs ALL cookies as they are changed
let listenerForUSPCookies = chrome.cookies.onChanged.addListener(
  (changeInfo) => {
    if (!changeInfo.removed) {
      let cookie = changeInfo.cookie;
      let domain = cookie.domain;
      domain = domain[0] == '.' ? domain.substring(1) : domain;
      let urlObj = psl.parse(domain);

      if (cookiesRegex.test(cookie.name)) {
        // console.log("Init logData() from listenerForUSPCookies")
        // console.log("logData domain: ", urlObj.domain)
        logData(urlObj.domain, "COOKIES", cookie);
      }
    }
    // console.log(analysis);
})

chrome.webNavigation.onCommitted.addListener((details) => {
// https://developer.chrome.com/docs/extensions/reference/history/#transition_types
  let validTransition = isValidTransition(details.transitionType);
  console.log("transitionType: ", details.transitionType);

  // changingSitesOnAnalysis, changingSitesOnUserRequest, sendingGPC
  if (validTransition) {
    if (changingSitesOnAnalysis) {
      // add SENDING GPC TO FILE
      // Turn off changing sites on analysis 
      addDomSignal();
      changingSitesOnAnalysis = false;
    } else {  // Must be on user request
      disableAnalysis();
      changingSitesOnUserRequest = true;
    }
  }
})

// Message passing listener - for collecting USPAPI call data from window
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.msg === "USPAPI_TO_BACKGROUND") {
    let url = new URL(message.location);
    let domain = parseURL(url);
    // console.log("Data from USPAPI returned to background", message.data);
    // console.log("Message object: ", message);
    // console.log("Init logData() from runtime.onMessage")
    // console.log("logData domain: ", domain)
    logData(domain, "USPAPI", message.data);
  }
  if (message.msg === "RUN_ANALYSIS") {
    runAnalysis();
  }
});

chrome.runtime.onConnect.addListener(function(port) {
  port.onMessage.addListener(function (message) {
    if (message.msg === "RUN_ANALYSIS_FROM_BACKGROUND") {
      runAnalysis();
    }
  })
})


/******************************************************************************/
/******************************************************************************/
/**********           # Exportable init / halt functions             **********/
/******************************************************************************/
/******************************************************************************/


function preinit() {
  // urlFlags = loadFlags()
}

export function init() {
	newIncognitoTab;
  listenerForUSPCookies;
}

function postinit() {}
  
export function halt() {
	// disableListeners(listenerCallbacks);
}