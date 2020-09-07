/*
OptMeowt is licensed under the MIT License
Copyright (c) 2020 Kuba Alicki, David Baraka, Rafael Goldstein, Sebastian Zimmeck
privacy-tech-lab, https://privacy-tech-lab.github.io/
*/


/*
domainlist.js
================================================================================
domainlist.js handles OptMeowt's reads/writes to the domainlist in the local
browser storage
*/


import { YAML } from "/libs/yaml-1.10.0/index.js";

/**
 * Exports the domainlist in local storage as a .txt file
 */
export async function handleDownload() {
    console.log("Downloading ...");
    chrome.storage.local.get(["DOMAINS"], function (result) {
      var DOMAINS = result.DOMAINS;
      // console.log(`YAML: ${YAML.stringify(DOMAINS, null)}`)
      var blob = new Blob([YAML.stringify(DOMAINS, null)], 
                          {type: "text/plain;charset=utf-8"});
      saveAs(blob, "OptMeowt_backup.yaml");
    })
    console.log("Downloaded!")
}

/**
 * Sets-up the process for importing a saved domainlist backup
 */
export async function startUpload() {
  document.getElementById("upload-domainlist").value = ""
  document.getElementById("upload-domainlist").click()
}

/**
 * Imports and updates the domainlist in local storage with an imported backup
 */
export async function handleUpload() {
    console.log("Starting upload ...");
    const file = this.files[0];
    const fr = new FileReader();
    fr.onload = function(e) {
      chrome.storage.local.set({ DOMAINS: YAML.parse(e.target.result) });
      console.log("Finished upload!")
    };
    fr.readAsText(file);
}

//////////////////////////////////////////////////////////////////////////

/**
 * Sets DOMAINS[domainKey] to true
 * @param {string} domainKey - domain to be changed in domainlist 
 */
export async function addToDomainlist(domainKey) {
  var new_domains = [];
  chrome.storage.local.get(["DOMAINS"], function (result) {
    new_domains = result.DOMAINS;
    new_domains[domainKey] = true;
    chrome.storage.local.set({ DOMAINS: new_domains });
  }); 
  console.log(domainKey, ", Added to domainlist.")
}

/**
 * Sets DOMAINS[domainKey] to false
 * @param {string} domainKey - domain to be changed in domainlist 
 */
export async function removeFromDomainlist(domainKey) {
  var new_domains = [];
  chrome.storage.local.get(["DOMAINS"], function (result) {
    new_domains = result.DOMAINS;
    new_domains[domainKey] = false;
    deleteDomainCookies(domainKey)
    chrome.storage.local.set({ DOMAINS: new_domains });
  });
  console.log(domainKey, ", Removed from domainlist.")
}

/**
 * Removes DOMAINS[domainKey] from DOMAINS
 * @param {string} domainKey - domain to be changed in domainlist 
 */
export async function permRemoveFromDomainlist(domainKey) {
  var new_domains = [];
  chrome.storage.local.get(["DOMAINS"], function (result) {
    new_domains = result.DOMAINS;
    delete new_domains[domainKey]
    deleteDomainCookies(domainKey)
    chrome.storage.local.set({ DOMAINS: new_domains });
  });
}

//////////////////////////////////////////////////////////////////////////

/**
 * 
 * @param {*} elementId 
 * @param {*} domain 
 */
function deleteDomainCookies(domainKey) {
  var cookie_arr = []
  chrome.cookies.getAll({ "domain": `${domainKey}` }, function(cookies) {
    cookie_arr = cookies
    console.log(`Retrieved ${domainKey} cookies: ${cookies}`)
    for (let i in cookie_arr) {
      console.log(`Cookie #${i}: ${cookie_arr[i]}`)
      chrome.cookies.remove({
        "url": `https://${domainKey}/`,
        "name": cookie_arr[i].name 
      }, function(details) {
        if (details === null) {
          console.log("Delete failed.")
        } else {
          console.log("Successfully deleted cookie.")
        }
      })
    }
  });
  
}

//////////////////////////////////////////////////////////////////////////

/**
 * Creates an event listener that toggles a given domain's stored value in 
 * the domainlist if a user clicks on the object with the given element ID
 * @param {string} elementId - HTML element to be linked to the listener
 * @param {string} domain - domain to be changed in domainlist 
 */
export async function toggleListener(elementId, domain) {
  
  document.getElementById(elementId).addEventListener("click", () => {
    chrome.storage.local.set({ ENABLED: true, DOMAINLIST_ENABLED: true });
    chrome.storage.local.get(["DOMAINS"], function (result) {
      if (result.DOMAINS[domain]) {
        removeFromDomainlist(domain);
      } else {
        addToDomainlist(domain);
      }
    })
  })

}