import React, { Component, Fragment } from 'react';
import Head from 'next/head';
import getConfig from 'next/config';
import Router from 'next/router';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { generateKeys } from '../helpers/Web3Helper'

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
  _isMounted = false

  constructor(props) {
    super(props)
    this.state = {
      register: false,
      loading: false,
      authData: {
        username: "",
        email: "",
        password: ""
      }
    }
  }

  componentDidMount() {
    this._isMounted = true
  }

  componentWillUnmount() {
    this._isMounted = false
  }
  createKey = (eth_account) => {
    
    fetch(`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/fetch-user-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      withCredentials: true,
      body: JSON.stringify(eth_account),
    })
      .then(response => {
        return response.text();
      })
      .then(async data => {
        const result = JSON.parse(data);
        
        console.log(result)
        this.setState({ loading: false });
        if (result.status) return true;
        else toast.error(result.message, toastOption);
      });
  }
  addAddressToUser = (eth_account) => {
    
    fetch(`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/add-user-address`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      withCredentials: true,
      body: JSON.stringify(eth_account),
    })
      .then(response => {
        return response.text();
      })
      .then(async data => {
        const result = JSON.parse(data);
        this.setState({ loading: false });
        if (result.status) return true;
        else toast.error(result.message, toastOption);
      });
  }
  
  signIn() {
    const email = this.state.authData.email;
    const password = this.state.authData.password;

    if (!email.length || !password.length) {
      toast.warn("Please fill all fields", toastOption);
      return false;
    }
    this.setState({ loading: true });

    fetch(`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/signin`, {
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
      .then(async data => {
        const result = JSON.parse(data);
        console.log(result)
        this.setState({ loading: false });
        if (result.status) {
          const eth_account = await generateKeys()
          await this.createKey(eth_account);
          await this.addAddressToUser(eth_account);
          Router.push('/');
        }
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

    fetch(`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/signup`, {
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

  handleInput(e) {
    let userAuthData = this.state.authData;
    userAuthData[e.target.name] = e.target.value;
    this.setState({ authData: userAuthData });
  }

  render() {
    if (this.state.hideContent) {
      return null
    }

    return (
      <Fragment>
        <Head>
          <title>Sign in | {publicRuntimeConfig.pageTitle}</title>
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
                    !this.state.register ?
                      <form action="" className="box" onSubmit={() => this.signIn()}>
                        <h3 className="title is-3 has-text-centered">Login</h3>
                        <div className="field">
                          <div className="buttons is-flex is-justify-content-space-around">
                            <a
                              className="button google is-rounded px-4 py-2 is-inverted is-small"
                              href={`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/auth/google`}
                            >
                              <span className="icon">
                                <i className="fab fa-google" />
                              </span>
                              <span>Login with Google</span>
                            </a>
                            <a
                              className="button google is-rounded px-4 py-2 is-inverted is-small"
                              href={`${process.env.REACT_APP_GOOGLE_AUTH_DOMAIN}/auth/facebook`}
                            >
                              <span className="icon">
                                <i className="fab fa-facebook" />
                              </span>
                              <span>Login with Facebook</span>
                            </a>
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
                            <button type="button" className="button is-rounded is-success" onClick={() => this.setState({ register: true })}>
                              Sign Up
                            </button>
                            <button type="submit" className="button is-rounded is-success" onClick={() => this.signIn()}>
                              Login
                            </button>
                          </div>
                        </div>
                      </form>
                      :
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
                          </div>
                        </div>
                      </form>
                  }
                </div>
              </div>

              <ToastContainer />
            </>
        }

        <style jsx>{`
          .button-container {
            margin-top: 2rem;
            margin-bottom: 2rem;
          }
          .button {
            margin-top: 1rem;
          }
          .button:hover {
            opacity: 1;
          }
          .github {
            border-color: #444;
          }
          .facebook {
            border-color: #3b5998;
            color: #3b5998;
          }
          .twitter {
            border-color: #1583d7;
            color: #1583d7;
          }
          .google {
            border-color: rgb(26, 115, 232);
            color: rgb(26, 115, 232);
          }
        `}</style>
      </Fragment>
    )
  }
}
