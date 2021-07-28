import { fetchUserByAddress } from '../lib/utility'
import React, { Component, useEffect, useState } from 'react'

export default (props) => {
  const address = props.sender
  const [user, setUser] = useState({})
  useEffect(
    function () {
      fetchUserByAddress(address).then((result) => {
        setUser(result.user)
      })
    },
    [],
  )

  if (!user) {
    return <section className="hero is-primary mb-6"></section>
  } else {
    return (
      <section className="hero is-primary mb-6">
        <img width={50} src={user.photo} className="p-2" />
        <a href={"/user?address="+address}>
          <h6 className=" p-2 title is-6">{user.username}</h6>
        </a>
      </section>
    )
  }
}
