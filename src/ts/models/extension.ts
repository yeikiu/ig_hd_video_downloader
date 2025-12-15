export enum DownloadType {
    ffmpegMerge,
    ffmpegProgress,
}

export interface FFmpegMergeMessage {
    type: DownloadType.ffmpegMerge;
    videoUrl: string;
    audioUrl: string;
    outputFileName: string;
    whatsappMode: boolean;
}

export interface FFmpegProgressMessage {
    type: DownloadType.ffmpegProgress;
    progress: number; // 0 to 1
}
