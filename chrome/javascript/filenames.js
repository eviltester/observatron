// Exportable functions for testing
// These can be loaded via importScripts() OR imported as a module

// Zero-pad a number to specified width
function zeropadDigits(padthis, padding){
    return ("000000" + padthis).slice((-1 * padding));
}

// Sanitize session name to be filesystem-safe
function sanitizeSessionName(sessionName) {
    if (!sessionName) return "";
    return sessionName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Generate filename with timestamp and folder structure
function getFileName(filepath, fileprefix, filetype, extension, sessionName, folderStructure){
    var datePart = new Date();
    
    var dateString = datePart.getFullYear() +
                    "-" + zeropadDigits(datePart.getMonth()+1,2) +
                    "-" + zeropadDigits(datePart.getDate(),2) +
                    "-" + zeropadDigits(datePart.getHours(),2) + 
                    "-" + zeropadDigits(datePart.getMinutes(),2) + 
                    "-" + zeropadDigits(datePart.getSeconds(),2) +
                    "-" + zeropadDigits(datePart.getMilliseconds(),3);
    
    var sanitizedSession = sanitizeSessionName(sessionName || "");
    
    var folderpath;
    if (folderStructure === "flat") {
        // Flat structure: 2025-12-28-sessionname/
        var flatFolder = datePart.getFullYear() + "-" +
                        zeropadDigits(datePart.getMonth()+1,2) + "-" +
                        zeropadDigits(datePart.getDate(),2);
        if (sanitizedSession) {
            flatFolder += "-" + sanitizedSession;
        }
        folderpath = flatFolder + "/";
    } else {
        // Nested structure: observatron/2025/12/28/sessionname/
        var sessionFolder = sanitizedSession ? sanitizedSession + "/" : "";
        folderpath = datePart.getFullYear() + "/" +
                    zeropadDigits(datePart.getMonth()+1,2) + "/" +
                    zeropadDigits(datePart.getDate(),2) + "/" +
                    sessionFolder;
    }
    
    var downloadFileName =  filepath+
                            folderpath+
                            fileprefix+
                            dateString+
                            "-" + filetype + "." + extension;
    
    return downloadFileName;
}

// Export for module usage (ESM)
// This allows: import { zeropadDigits, getFileName } from './filenames.js'
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        zeropadDigits: zeropadDigits,
        sanitizeSessionName: sanitizeSessionName,
        getFileName: getFileName
    };
}

// Export for ES6 modules
// This allows: import { zeropadDigits } from './filenames.js'
if (typeof window === 'undefined' && typeof exports !== 'undefined') {
    exports.zeropadDigits = zeropadDigits;
    exports.sanitizeSessionName = sanitizeSessionName;
    exports.getFileName = getFileName;
}
