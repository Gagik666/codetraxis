import { configureStore } from '@reduxjs/toolkit';
import treeSlice from './treeSlice/TreeSlice';
import fileSlice from './fileSlice/FileSlice';
import debugSlice from './debugSlice/DebugSlice';

const store = configureStore({
  reducer: {
    treeReducer: treeSlice,
    fileReducer: fileSlice,
    debugReducer: debugSlice,
  },
});

export default store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
