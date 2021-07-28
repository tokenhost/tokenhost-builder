import React, { Component, Fragment } from 'react'
import Head from 'next/head'
import getConfig from 'next/config'
import Router from 'next/router'
import Web3 from 'web3';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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

  signIn() {
    const email = this.state.authData.email;
    const password = this.state.authData.password;

    if (!email.length || !password.length) {
      toast.warn("Please fill all fields", toastOption);
      return false;
    }
    this.setState({ loading: true });

    fetch(`${process.env.REACT_APP_BACKEND_URL}/auth/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      withCredentials: true,
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(response => {
        return response.text();
      })
      .then(data => {
        const result = JSON.parse(data);
        this.setState({ loading: false });
        if (result.status) Router.push('/');
        else toast.error(result.message, toastOption);
      });
  }

  signUp() {
    const username = this.state.authData.username;
    const email = this.state.authData.email;
    const password = this.state.authData.password;

    if (!username.length || !email.length || !password.length) {
      toast.warn("Please fill all fields", toastOption);
      return false;
    }

    this.setState({ loading: true });

    fetch(`${process.env.REACT_APP_BACKEND_URL}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: username, email: email, password: password }),
    })
      .then(response => {
        return response.text();
      })
      .then(data => {
        const result = JSON.parse(data);
        this.setState({ loading: false });
        if (result.status) {
          toast.success("Registration was successful.", toastOption);
          this.setState({ register: false });
        }
        else
          toast.error(result.message, toastOption);
      });
  }


  handleAuthenticate = ({ publicAddress, signature }) =>
    fetch(`${process.env.REACT_APP_BACKEND_URL}/auth/metamask`, {
      body: JSON.stringify({ publicAddress, signature }),
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      withCredentials: true,
      method: 'POST',
    })
    .then((response) => response.json())
    .then(result => {
      this.setState({ loading: false });
      if (result.status) Router.push('/');
      else toast.error(result.message, toastOption);
      return true;
    });

  async handleSignMessage({ metamask, nonce }) {
    if (metamask === undefined) {
      return false;
    }
    try {
      const signature = await web3?.eth.personal.sign(
        `I am signing my one-time nonce: ${nonce}`,
        web3.utils.toChecksumAddress(metamask),
        '' // MetaMask will ignore the password argument here
      );

      return { publicAddress: metamask, signature };
    } catch (err) {
      console.log(err);
      this.setState({ loading: false });
      return false;
    }
  }

  handleMetamaskSignup() {
    if (!this.state.emailInput) {
      this.setState({ loading: false });
      this.setState({ emailInput: true });
      return false;
    }

    this.setState({ loading: true });
    this.setState({ emailInput: false });
    const publicAddress = this.state.publicAddress;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/metamask/users`, {
      body: JSON.stringify({ email: this.state.authData.email, publicAddress: publicAddress }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }).then((response) => response.json())
    .then(result => {
      if (result.status) this.handleLoginWithMetamask();
      toast.error(result.message, toastOption);
      return false;
    });
  }

  async handleLoginWithMetamask() {
    // Check if MetaMask is installed
    if (!(window).ethereum) {
      window.alert('Please install MetaMask first.');
      return;
    }

    if (!web3) {
      try {
        // Request account access if needed
        await (window).ethereum.enable();

        // We don't know window.web3 version, so we use our own instance of Web3
        // with the injected provider given by MetaMask
        web3 = new Web3((window).ethereum);
      } catch (error) {
        window.alert('You need to allow MetaMask.');
        return;
      }
    }

    const coinbase = await web3.eth.getCoinbase();
    if (!coinbase) {
      window.alert('Please activate MetaMask first.');
      return;
    }

    const publicAddress = coinbase.toLowerCase();

    this.setState({ publicAddress: publicAddress })
    this.setState({ loading: true });

    // Look if user with current publicAddress is already present on backend
    fetch(
      `${process.env.REACT_APP_BACKEND_URL}/metamask/users?publicAddress=${publicAddress}`
    )
      .then((response) => response.json())
      // If yes, retrieve it. If no, create it.
      .then(async (result) =>
        result.user ? result.user : this.handleMetamaskSignup()
      )
      // Popup MetaMask confirmation modal to sign message
      .then((result) => this.handleSignMessage(result))
      // Send signature to backend on the /auth route
      .then(this.handleAuthenticate)
  }

  handleInput(e) {
    let userAuthData = this.state.authData;
    userAuthData[e.target.name] = e.target.value;
    this.setState({ authData: userAuthData });
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
                  {
                    !this.state.loginWithEmail &&
                    <div className="box">
                      <h3 className="title is-3 has-text-centered">Login</h3>
                      <div className="field">
                        <div className="buttons">
                          <a
                            className="button is-link is-fullwidth google px-4 py-2 mb-4"
                            href={`${process.env.REACT_APP_BACKEND_URL}/auth/google`}
                          >
                            <span className="icon">
                              <i className="fab fa-google" />
                            </span>
                            <span>Login with Google</span>
                          </a>
                          <a
                            className="button is-link is-fullwidth facebook px-4 py-2 mb-4"
                            href={`${process.env.REACT_APP_BACKEND_URL}/auth/facebook`}
                          >
                            <span className="icon">
                              <i className="fab fa-facebook" />
                            </span>
                            <span>Login with Facebook</span>
                          </a>
                          <button
                            className="button is-primary is-fullwidth metamask px-4 py-2 mb-4"
                            onClick={() => this.setState({ loginWithEmail: true })}
                          >
                            <span className="icon">
                              <i className="fas fa-envelope" />
                            </span>
                            <span>Login with Email</span>
                          </button>
                          <button
                            className="button is-primary is-fullwidth metamask px-4 py-2 mb-4"
                            onClick={() => this.handleLoginWithMetamask()}
                          >
                            <span>Login with Metamask</span>
                          </button>
                        </div>
                      </div>
                      {
                        this.state.emailInput &&
                        <div className="field">
                          <label htmlFor="email" className="label">Email</label>
                          <div className="control has-icons-left">
                            <input type="email" name="email" id="email" placeholder="e.g. bobsmith@gmail.com" className="input" onChange={(e) => this.handleInput(e)} required />
                            <span className="icon is-small is-left">
                              <i className="fa fa-envelope"></i>
                            </span>
                          </div>

                          <button
                            className="button is-primary is-fullwidth metamask px-4 py-2 mt-4"
                            onClick={() => this.handleMetamaskSignup()}
                          >
                            <span>Continue</span>
                          </button>
                        </div>
                      }
                    </div>
                  }
                  {
                    this.state.loginWithEmail && !this.state.register &&
                    <form action="" className="box" onSubmit={() => this.signIn()}>
                      <h3 className="title is-3 has-text-centered">Login</h3>
                      <div className="field">
                        <label htmlFor="email" className="label">Email</label>
                        <div className="control has-icons-left">
                          <input type="email" name="email" id="email" placeholder="e.g. bobsmith@gmail.com" className="input" onChange={(e) => this.handleInput(e)} required />
                          <span className="icon is-small is-left">
                            <i className="fa fa-envelope"></i>
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="password" className="label">Password</label>
                        <div className="control has-icons-left">
                          <input type="password" name="password" id="password" placeholder="*******" className="input" onChange={(e) => this.handleInput(e)} required />
                          <span className="icon is-small is-left">
                            <i className="fa fa-lock"></i>
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <div className="buttons is-justify-content-space-between">
                          <button type="button" className="button is-rounded is-success" onClick={() => this.setState({ register: true })}>
                            Sign Up
                          </button>
                          <button type="submit" className="button is-rounded is-success" onClick={() => this.signIn()}>
                            Login
                          </button>
                          <button type="submit" className="button is-rounded is-success" onClick={() => this.setState({ loginWithEmail: false })}>
                            Back
                          </button>
                        </div>
                      </div>
                    </form>
                  }
                  {
                    this.state.loginWithEmail && this.state.register &&
                    <form action="" className="box" onSubmit={() => this.signIn()}>
                      <h3 className="title is-3 has-text-centered">Register</h3>
                      <div className="field">
                        <label htmlFor="username" className="label">Name</label>
                        <div className="control has-icons-left">
                          <input type="text" name="username" id="username" placeholder="roseman" className="input" onChange={(e) => this.handleInput(e)} required />
                          <span className="icon is-small is-left">
                            <i className="fa fa-account"></i>
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="email" className="label">Email</label>
                        <div className="control has-icons-left">
                          <input type="email" name="email" id="email" placeholder="e.g. bobsmith@gmail.com" className="input" onChange={(e) => this.handleInput(e)} required />
                          <span className="icon is-small is-left">
                            <i className="fa fa-envelope"></i>
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="password" className="label">Password</label>
                        <div className="control has-icons-left">
                          <input type="password" name="password" id="password" placeholder="*******" className="input" onChange={(e) => this.handleInput(e)} required />
                          <span className="icon is-small is-left">
                            <i className="fa fa-lock"></i>
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <div className="buttons is-justify-content-space-between">
                          <button type="button" className="button is-rounded is-success" onClick={() => this.setState({ register: false })}>
                            Sign In
                          </button>
                          <button type="submit" className="button is-rounded is-success" onClick={() => this.signUp()}>
                            Register
                          </button>
                          <button type="submit" className="button is-rounded is-success" onClick={() => this.setState({ loginWithEmail: false })}>
                            Back
                          </button>
                        </div>
                      </div>
                    </form>
                  }
                </div>
              </div>

              <ToastContainer />
            </>
        }
      </Fragment>
    )
  }
}
