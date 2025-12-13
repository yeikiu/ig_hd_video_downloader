import { Downloader } from './downloaders/Downloader';
import { sleep } from './functions';

export function singleton(constructor: any): any {
    return new Proxy(constructor, {
        construct(target: any, argArray: any, newTarget?: any): object {
            if (target.prototype !== newTarget.prototype) {
                return Reflect.construct(target, argArray, newTarget);
            }
            if (!target.SINGLETON_INSTANCE) {
                target.SINGLETON_INSTANCE = Reflect.construct(target, argArray, newTarget);
            }

            return target.SINGLETON_INSTANCE;
        },
    });
}

export function stopObservation(_: object,
                                __: string,
                                descriptor: PropertyDescriptor): void {

    const value = descriptor.value;
    descriptor.value = function(): void {
        Downloader.observer.disconnect();
        Downloader.observer.takeRecords();
        sleep(100).then(() => value.apply(this, arguments));
        sleep(150).then(() => Downloader.observer.observe());
    };

}
