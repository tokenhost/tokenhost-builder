
function fetchUserItems(collectionName) {
  return new Promise((resolve, reject) => {
    fetch(`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/fetch-user-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      withCredentials: true
    })
      .then(response => {
        return response.text();
      })
      .then(async data => {
        const result = JSON.parse(data);
        if (result.status) resolve(result)
        resolve({});
      });
  })
}

function fetchUserByAddress(address) {
  return new Promise((resolve, reject) => {
    fetch(`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/fetch-user-by-address`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      withCredentials: true,
      body: JSON.stringify({address: address}),
    })
      .then(response => {
        return response.text();
      })
      .then(async data => {
        const result = JSON.parse(data);
        if (result.status) resolve(result);
        resolve({});
      });
  })
}

export {
  fetchUserItems,
  fetchUserByAddress
}
