export interface DownloadMessage {
    downloadURL: string[];
    outputFileName: string;
    type: DownloadType;
}

export enum DownloadType {
    single,
    ffmpegMerge
}

export interface FFmpegMergeMessage {
    type: DownloadType.ffmpegMerge;
    videoUrl: string;
    audioUrl: string;
    accountName: string;
    videoDuration: number;
    outputFileName: string;
}
