import React, { Component, Fragment } from 'react'
import Head from 'next/head'
import getConfig from 'next/config'
import Router from 'next/router'
import { useDispatch, useSelector } from 'react-redux';

import Web3 from 'web3';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getMetamaskAddress, metaMaskLogin } from '../helpers/Web3Helper'
import { setNetworkId, setMetamaskConnected, setEthAddress, setUser, initialState } from '../features/users/userSlice';

let web3 = undefined; // Will hold the web3 instance

export default function Signin() {
  const dispatch = useDispatch();


  const handleLoginWithMetamask = async () => {
    await metaMaskLogin();
    const publicAddress = await getMetamaskAddress()
    console.log('pub',publicAddress)
    console.log("set eth")
    dispatch(setEthAddress(publicAddress))
    console.log("/set eth")

    Router.push('/');
  }


    return (
      <Fragment>
        <Head>
          <title>Sign in</title>
          <link
            rel="stylesheet"
            href="https://use.fontawesome.com/releases/v5.6.3/css/all.css"
          />
        </Head>
        
         
            <>
              <div className="columns">
                <div className="column is-one-third is-offset-one-third">
                    <div className="box">
                      <h3 className="title is-3 has-text-centered">Login</h3>
                      <div className="field">
                        <div className="buttons">
                          <button
                            className="button is-primary is-fullwidth metamask px-4 py-2 mb-4"
                            onClick={() => handleLoginWithMetamask()}
                          >
                            <span>Login with Metamask</span>
                          </button>
                        </div>
                      </div>
                      
                    </div>
                </div>
              </div>

              <ToastContainer />
            </>
        
      </Fragment>
    )
  }
