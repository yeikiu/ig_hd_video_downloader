export enum DownloadType {
    ffmpegMerge,
}

export interface FFmpegMergeMessage {
    type: DownloadType.ffmpegMerge;
    videoUrl: string;
    audioUrl: string;
    outputFileName: string;
}
