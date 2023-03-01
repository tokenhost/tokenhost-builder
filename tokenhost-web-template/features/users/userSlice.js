// userSlice.js

import { createSlice } from '@reduxjs/toolkit';

export const initialState = {
  networkId: '',
  metamaskConnected: false,
  ethAddress: ''
};

export const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setNetworkId: (state, action) => {
      state.networkId = action.payload;
    },
    setMetamaskConnected: (state, action) => {
      state.metamaskConnected = action.payload;
    },
    setEthAddress: (state, action) => {
      state.ethAddress = action.payload;
    },
    setUser: (state, action) => {
      const { networkId, metamaskConnected, ethAddress } = action.payload;
      state.networkId = networkId;
      state.metamaskConnected = metamaskConnected;
      state.ethAddress = ethAddress;
    }
  }
});

export const { setNetworkId, setMetamaskConnected, setEthAddress, setUser } = userSlice.actions;
export const getNetworkId = state => state.user.networkId;
export const getMetamaskConnected = state => state.user.metamaskConnected;
export const getEthAddress = state => state.user.ethAddress;
export default userSlice.reducer;
