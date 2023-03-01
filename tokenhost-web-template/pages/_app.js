import '../styles/globals.css'
import Nav from '../components/Nav.js'
import '../assets/sass/styles.scss'

import { store } from '../store'
import { Provider } from 'react-redux'



function MyApp({ Component, pageProps }) {
  return (
    <Provider store={store}>
    <Nav></Nav>
      <section className="section">
        <Component {...pageProps} />
      </section>
      </Provider>
  )
}

export default MyApp
