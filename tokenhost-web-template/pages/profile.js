import React, { Component, Fragment, useEffect, useState } from 'react'

export default function ProfilePage() {
    const [signedUser, setSignedUser] = useState(null);
    useEffect(() => {
        fetch(`${process.env.REACT_APP_BACKEND_URL}/check-auth`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            withCredentials: true,
        })
            .then(response => {
                return response.text();
            })
            .then(data => {
                const { message, user } = JSON.parse(data);
                setSignedUser(user);
                console.log(message);
            });
    }, [])
    return (
        <Fragment>
            <div className="hero is-fullheight">
                {
                    signedUser ?
                        <div className="hero-body">
                            <div className="container has-text-centered">
                                <div className="column is-6 is-offset-3">
                                    <h3 className="title has-text-black">Profile</h3>
                                    <hr className="login-hr" />
                                    <div className="box px-6">
                                        <div className="avatar is-flex is-justify-content-center mb-3">
                                            <figure className="image is-128x128 m-0">
                                                <img className="is-rounded" src={signedUser.photo ? signedUser.photo : "https://bulma.io/images/placeholders/128x128.png"} />
                                            </figure>
                                        </div>
                                        <form>
                                            <div className="field">
                                                <div className="control is-flex is-justify-content-space-between is-align-items-center">
                                                    <label className="has-text-weight-semibold">Username : </label>
                                                    <span>{signedUser.username}</span>
                                                </div>
                                            </div>

                                            <div className="field">
                                                <div className="control is-flex is-justify-content-space-between is-align-items-center">
                                                    <label className="has-text-weight-semibold">Email : </label>
                                                    <span>{signedUser.email}</span>
                                                </div>
                                            </div>
                                            <div className="field">
                                                <div className="control is-flex is-justify-content-space-between is-align-items-center">
                                                    <label className="has-text-weight-semibold">Google : </label>

                                                    {signedUser.google ?
                                                        <button type="button" className="button is-primary is-small">On</button>
                                                        :
                                                        <button type="button" className="button is-danger is-small">Off</button>}
                                                </div>
                                            </div>
                                            <div className="field">
                                                <div className="control is-flex is-justify-content-space-between is-align-items-center">
                                                    <label className="has-text-weight-semibold">Facebook : </label>

                                                    {signedUser.facebook ?
                                                        <button type="button" className="button is-primary is-small">On</button>
                                                        :
                                                        <button type="button" className="button is-danger is-small">Off</button>}
                                                </div>
                                            </div>
                                            <div className="field">
                                                <div className="control is-flex is-justify-content-space-between is-align-items-center">
                                                    <label className="has-text-weight-semibold">MetaMask : </label>

                                                    {signedUser.metamask ?
                                                        <button type="button" className="button is-primary is-small">On</button>
                                                        :
                                                        <button type="button" className="button is-danger is-small">Off</button>}
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                        :
                        <div></div>
                }
            </div>
        </Fragment>
    )
}
