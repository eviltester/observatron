function zeropadDigits(padthis, padding){
    return ("000000" + padthis).slice((-1 * padding));
  }
  
function getFileName(filepath, fileprefix, filetype, extension){

    var datePart = new Date();

    var dateString = datePart.getFullYear() +
                    "-" + zeropadDigits(datePart.getMonth()+1,2) +
                    "-" + zeropadDigits(datePart.getDate(),2) +
                    "-" + zeropadDigits(datePart.getHours(),2) + 
                    "-" + zeropadDigits(datePart.getMinutes(),2) + 
                    "-" + zeropadDigits(datePart.getSeconds(),2) +
                    "-" + zeropadDigits(datePart.getMilliseconds(),3);

    var folderpath = datePart.getFullYear() + "/" + 
                    zeropadDigits(datePart.getMonth()+1,2) + "/" +
                    zeropadDigits(datePart.getDate(),2) + "/";
    

    var downloadFileName =  filepath+
                            folderpath+
                            fileprefix+
                            dateString+
                            "-" + filetype + "." + extension;
    
    return downloadFileName;                            
}