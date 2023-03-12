import React, { Component, useState, useEffect } from "react";
import { put } from "../lib/db";
import { Puff } from  'react-loader-spinner'

export default (props) => {
  const [image, setImage] = useState(null);
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);

  const handleChange = (e) => {
    if (e.target.files[0]) {
      const image = e.target.files[0];
      setImage(image);
    }
  };

  const handleUpload = async () => {
        setProgress(1);
	  const url =  await put(image)
            props.setImage(url);
            setUrl(url);
	  setProgress(100);
  };

  if (image && progress == 0) {
    handleUpload();
  }

  return (
    <div className="center">
      <div className="file is-info has-name">
        <label className="file-label">
          <input 
            className="file-input input"
            type="file"
            onChange={handleChange} />
          <span className="file-cta">
            <span className="file-icon">
              <i className="fas fa-upload"></i>
            </span>
            <span className="file-label">Upload Image</span>
          </span>
        </label>
      </div>

      {progress > 0 && progress < 100 && (
        <div className="row p-2">
          <Puff
		  height="80"
		  width="80"
		  radius={1}
		  color="#e6b300"
		  ariaLabel="puff-loading"
		  wrapperStyle={{}}
		  wrapperClass=""
		  visible={true}
		/>
        </div>
      )}
      {url}
      {url && (
        <div className="row p-2">
          <img src={url} alt="Uploaded Images" height="300" width="400" />
        </div>
      )}
    </div>
  );
};
