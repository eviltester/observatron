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
}