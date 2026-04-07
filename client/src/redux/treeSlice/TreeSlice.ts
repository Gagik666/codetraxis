import { getAppTreeThunk } from './asyncthunk'
import { createSlice } from '@reduxjs/toolkit'
import type { IInitialState } from './types'
import type { RootState } from '../Store'

const initialState: IInitialState = {
    appTree: null,
}

const TreeSlice = createSlice({
    name: 'treeSlice',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(getAppTreeThunk.fulfilled, (state, action) => {
                state.appTree = action.payload;
            })
    }
})

export const selectAppTree = (state: RootState) => state.treeReducer.appTree

export default TreeSlice.reducer
