import React, { useState } from "react";

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

  const handleUpload = () => {
    if (!image) {
      alert("null image");
      return;
    }
    const uploadedFilePath = `${props.user.id}`;

    const formData = new FormData()
    formData.append('uploadedFile', image);
    formData.append('uploadedFilePath', uploadedFilePath);

    fetch(`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/image-upload`, {
      method: 'POST',
      body: formData
    })
      .then(response => response.json())
      .then(data => {     
        const downloadURL = process.env.REACT_APP_GOOGLE_AUTH_DOMAIN + data.downloadURL
        setUrl(downloadURL);
        props.setImage(downloadURL);
      })
      .catch(error => {
        console.error(error)
      })
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
      {url && (
        <div className="row p-2">
          <img src={url} alt="Uploaded Images" height="300" width="400" />
        </div>
      )}
    </div>
  );
};
