import React, { Component, Fragment } from 'react'
import Head from 'next/head'
import getConfig from 'next/config'
import Router from 'next/router'
import Web3 from 'web3';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getMetamaskAddress } from '../helpers/Web3Helper'

let web3 = undefined; // Will hold the web3 instance

const { publicRuntimeConfig } = getConfig()
const toastOption = {
  position: "top-center",
  autoClose: 2001,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
}

export default class signin extends Component {

  constructor(props) {
    super(props)
    this.state = {
      register: false,
      loginWithEmail: false,
      emailInput: false,
      loading: false,
      publicAddress: "",
      authData: {
        username: "",
        email: "",
        password: ""
      }
    }
  }

  
  async handleLoginWithMetamask() {
    const publicAddress = await getMetamaskAddress()

    this.setState({ publicAddress: publicAddress })
    this.setState({ loading: true });
    Router.push('/');
  }

  render() {

    return (
      <Fragment>
        <Head>
          <title>Sign in</title>
          <link
            rel="stylesheet"
            href="https://use.fontawesome.com/releases/v5.6.3/css/all.css"
          />
        </Head>
        {
          this.state.loading ?
            <div className="loader-wrapper">
              <span className="loader"></span>
            </div>
            :
            <>
              <div className="columns">
                <div className="column is-one-third is-offset-one-third">
                    <div className="box">
                      <h3 className="title is-3 has-text-centered">Login</h3>
                      <div className="field">
                        <div className="buttons">
                          <button
                            className="button is-primary is-fullwidth metamask px-4 py-2 mb-4"
                            onClick={() => this.handleLoginWithMetamask()}
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
        }
      </Fragment>
    )
  }
}
