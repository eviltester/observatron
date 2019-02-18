function Options(){

    this.engaged = false;

    // which events are we responding to
    this.onScrollEvent= true;
    this.onResizeEvent= true;
    this.onPageLoad= true;
    this.onPageUpdated= false;
    this.onDoubleClickShot= true;
    this.onPostSubmit= false;

    // where are the files stored?
    this.filepath= "observatron/";
    this.fileprefix= "obs_";

    // 
    this.scrolling_timeout_milliseconds= 500;
    this.resize_timeout_milliseconds= 500;

    this.isSet = function(value){
        return value !== undefined && value !== NaN && value!=null;
    }

    this.setBooleanPropertyIfValid = function(propertyName, value){
        if(this.isSet(value)){
            this[propertyName] = value;
        }
    }

    this.setNumericPropertyIfValid = function(propertyName, value){
        if(this.isSet(value) && value >=0){
            this[propertyName] = value;
        }
    }
    this.setFilePropertyIfValid = function(propertyName, value){
        if(this.isSet(value)){
            // todo could filter out invalid file characters
            this[propertyName] = value;
        }
    }
}

/*
    Only set if value is valid, 
    if not then don't raise an error just don't set
*/
Options.prototype.setOnResizeEvent = function(value){
    this.setBooleanPropertyIfValid("onResizeEvent", value);
};
Options.prototype.setOnScrollEvent = function(value){
    this.setBooleanPropertyIfValid("onScrollEvent", value);
};
Options.prototype.setOnPageLoad = function(value){
    this.setBooleanPropertyIfValid("onPageLoad", value);
};
Options.prototype.setOnPageUpdated = function(value){
    this.setBooleanPropertyIfValid("onPageUpdated", value);
};
Options.prototype.setOnDoubleClickShot = function(value){
    this.setBooleanPropertyIfValid("onDoubleClickShot", value);
};
Options.prototype.setOnPostSubmit = function(value){
    this.setBooleanPropertyIfValid("onPostSubmit", value);
};
Options.prototype.setScrollingTimeoutMilliseconds = function(value){
    this.setNumericPropertyIfValid("scrolling_timeout_milliseconds", value);
}
Options.prototype.setResizeTimeoutMilliseconds = function(value){
    this.setNumericPropertyIfValid("resize_timeout_milliseconds", value);
}
Options.prototype.setFilePath = function(value){
    this.setFilePropertyIfValid("filepath", value);
}
Options.prototype.setFilePrefix = function(value){
    this.setFilePropertyIfValid("fileprefix", value);
}