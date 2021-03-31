import cluster from 'cluster';
import { Worker } from 'node:cluster';

const CLUSTER_SIZE: number = 5;

class TypeStatus<T>{
    status: ProcessStatus;
    data: T;
}

class ProcessStatus{
    id: number;
    label: string;
}

class Collection{
    foo: string;
    bar: number;
    baz: Date;
}

class FifoQueue<T>{
    data: T[];
    constructor(initialData: T[]){
        this.data = initialData;
    }

    add(data: T): void{
        // wouldn't .push work?
        this.data.push(data);
    }
    get(count: number = 1): T|T[]{
        return this.data.splice(0, count)
    }
}

class Collector{
    queue: FifoQueue<Collection>;

    constructor(data: Collection[]){
        this.queue = new FifoQueue<Collection>(data);
    }
    length(){
        return this.queue.data.length;
    }
    getProcessRange(pageSize: number = 20){
        return this.queue.get(pageSize);
    }
    add(newData: Collection){
        this.queue.add(newData);
    }
}

class MainProcess{
    collector: Collector;
    private static instance: MainProcess;
    private workers: Worker[] = [];
    private constructor(){
        for(let i=0; i < CLUSTER_SIZE; i++){
            const worker = cluster.fork({part: i});
            worker.on('message', this.workerResponses);
            this.workers.push(worker);
        }
        /**
         * this is part of a scenario that I think could keep us from
         * having to have the worker determine if discovery should be done.
         */
        cluster.once('online', this.workerIsOnline);
        setTimeout(() => process.exit(), 10000);
    }

    /**
     * this is the part that gets run once and triggers discovery.
     * @param msg 
     * @param worker 
     */
    private workerIsOnline(worker: Worker){
        console.log('sending process Discovery process.')
        worker.send({request: 'processDiscovery'})
    }

    private workerResponses(msg: any, worker: Worker){
        const {data, request} = msg;
        console.log(request);
        switch(request){
            case 'discoveryComplete':
                console.log('discovery Processed.');
                this.queueDiscovery(data);
                break;
            default:
                console.log('no action configured for this message type.');
        }
    }

    private queueDiscovery(data: Collection[]){
        this.collector = new Collector(data);
        const partSize = (this.collector.length()) / CLUSTER_SIZE;
        for(let worker of this.workers){
            worker.send({request: 'processCollectionPart', data: this.collector.getProcessRange(partSize)});
        }
    }
    public static getInstance(){
        if(!MainProcess.instance){
            MainProcess.instance = new MainProcess();
        }
        return MainProcess.instance;
    }
}

class WorkerProcess{
    constructor(){
        //probably not going to be needed if updated code in main works.
        // if(Number(process.env.part) === 0){
        //     console.log(`starting discovery on worker ${process.getegid()} ${process.geteuid()} ${process.env.id}`);
        //     const discovery = new Discovery().discoveredData;
        //     !!process.send ? process.send({request: 'discoveredData', data: discovery}): console.error('unable to send master message because send is not defined on process in this instance.');
        // }
        // process.emit('ready');
        /**
         * Let's also do the same as we did in the main process 
         * and define a worker message handler elsewhere.
         */
        process.on('message', this.handleMainMessages);
        setTimeout(() => process.exit(), 10000);
    }

    processCollection(data: Collection[]){
        data.forEach(datum => {
            const seed = Math.round(Math.random() * 3000);
            setTimeout(() => {
                const success = Math.round(Math.random() * 100)
                 !!process.send ?
                    success > 55 ? 
                    process.send({request: 'collectionSuccess', data: datum}) :
                    process.send({request: 'collectionFailure', data: datum}) :
                    console.log('Cannot Send, its undefined.');
            }, seed)
        })
    }

    private handleMainMessages(msg: any, handle?:any){
        const {request, data} = msg;
        switch(request){
            case 'processDiscovery':
                const discovery = generateRandos();
                !!process.send ? process.send({request: 'discoveryComplete', data: discovery}) : console.log('Unable to send Discovery, is the main node still alive?');
                break;
            case 'processCollectionPart':
                const partData = this.processCollection(data); // to be defined. can be just for show.
                // !!process.send ? process.send({request: 'collectorDataResult', data: partData});
            default:
                console.log(`Message Type ${msg.request} is not configured.`);
        }
    }
}
    const generateRandos = (): Collection[] => {
        const dat = [];
        const seed = (Math.floor(Math.random() * 100));
        console.log(`generating randoms with seed ${seed}`);
        for(let i =0; i<seed;i++){
            dat.push({
                foo: Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5),
                bar: Math.floor(Math.random()) * 100,
                baz: new Date()
            });
        }
        return dat;
    }

if(cluster.isMaster){
    const server = MainProcess.getInstance();
    // const workers: Worker[] = []
    // for(let i=0; i < CLUSTER_SIZE; i++){
    //     // workers.push(cluster.fork({part: i}));
    //     const worker = cluster.fork({part: i});
    //     /**
    //      * Let's move the event handler for the message outside this block.
    //      * Maybe call it `mainEvents`
    //      */
    //     worker.on('message', (msg, worker) => {
    //         console.log(msg);
    //         const {data} = msg;
    //         switch(data.request){
    //             case 'discoveryComplete':
    //                 console.log('discovery Processed.');
    //                 console.log(data.data);
    //                 break;
    //             default:
    //                 console.log('no action required for this message type.');
    //         }
    //     });
    //     workers.push(worker);
    // }
    // cluster.once('ready', (worker) => {
    //     console.log('parent received a ready signal');
    // })
    // while()
    // cluster.workers[0] ? cluster.workers[0].send({request: 'processDiscovery'}) : (() => {
    //     console.error(`workers are not initialized.`);
    //     process.exit(1);
    // })();
    // cluster.on('discoveryComplete', )  
} else {
    console.log(`[${process.env.part}] Now online`);
    const worker = new WorkerProcess();
    // if(Number(process.env.part) === 0){
    //     console.log(`starting discovery on worker ${process.getegid()} ${process.geteuid()} ${process.env.id}`);
    //     const discovery = new Discovery().discoveredData;
    //     !!process.send ? process.send({request: 'discoveredData', data: discovery}): console.error('unable to send master message because send is not defined on process in this instance.');
    // }
    // // process.emit('ready');
    // /**
    //  * Let's also do the same as we did in the main process 
    //  * and define a worker message handler elsewhere.
    //  */
    // process.on('message', (msg) => {

    // });
}