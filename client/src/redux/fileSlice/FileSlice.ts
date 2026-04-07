import { createSlice } from '@reduxjs/toolkit';
import type { IFileState } from './types';
import type { RootState } from '../Store';
import { getFileContentThunk } from './asyncthunk';

const initialState: IFileState = {
    selectedFile: null,
    loading: false,
};

const FileSlice = createSlice({
    name: 'fileSlice',
    initialState,
    reducers: {
        clearFile: (state) => {
            state.selectedFile = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getFileContentThunk.pending, (state) => {
                state.loading = true;
            })
            .addCase(getFileContentThunk.fulfilled, (state, action) => {
                state.selectedFile = action.payload;
                state.loading = false;
            })
            .addCase(getFileContentThunk.rejected, (state) => {
                state.loading = false;
            });
    },
});

export const { clearFile } = FileSlice.actions;

export const selectFile = (state: RootState) => state.fileReducer.selectedFile;
export const selectFileLoading = (state: RootState) => state.fileReducer.loading;

export default FileSlice.reducer;
