function zeropadDigits(padthis, padding){
    return ("000000" + padthis).slice((-1 * padding));
  }

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
