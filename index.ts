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
    private writer: Worker;
    private workers: Worker[] = [];
    private partSize: number;
    private constructor(){
        for(let i=0; i < CLUSTER_SIZE; i++){
            const worker = cluster.fork({part: i});
            worker.on('message', this.workerResponses);
            if(i === 0){
                this.writer = worker;
            } else {
                this.workers.push(worker);
            }
        }

        setTimeout(this.haltProcess , 5*60*1000)
        /**
         * this is part of a scenario that I think could keep us from
         * having to have the worker determine if discovery should be done.
         */
        cluster.once('online', this.workerIsOnline);
    }

    private haltProcess(){
        this.workers.forEach(w => w.send({request: 'haltCollection'}));
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
            case 'collectionSuccess':
                this.writer.send({request: 'writeData', data});
                if(this.collector.length() > 0){
                    worker.send({request: 'processCollectionPart', data: this.collector.getProcessRange(this.partSize)})
                }
                break;
            case 'collectionFailure':
                this.processCollectionFailure(data, worker)
                break;
            case 'haltedCollection':
                this.writer.send({request: 'writeFailureData', data});
                break;
            default:
                console.log('no action configured for this message type.');
        }
    }

    private processCollectionFailure(data: any, worker: Worker){
        this.collector.add(data);
        worker.send({request: 'processCollectionPart', data: this.collector.getProcessRange});
    }

    private queueDiscovery(data: Collection[]){
        this.collector = new Collector(data);
        this.partSize = ((this.collector.length()) / CLUSTER_SIZE)/3;
        for(let worker of this.workers){
            worker.send({request: 'processCollectionPart', data: this.collector.getProcessRange(this.partSize)});
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
    processActive: boolean = false;
    haltCollection: boolean = false;
    constructor(){

        /**
         * Let's also do the same as we did in the main process 
         * and define a worker message handler elsewhere.
         */
        process.on('message', this.handleMainMessages);
        
    }

    processCollection(data: Collection[]){
        this.processActive = true;
        data.forEach((datum, index, array) => {
            if(!this.haltCollection){
                const seed = Math.round(Math.random() * 3000);
                setTimeout(() => {
                    const success = Math.round(Math.random() * 100)
                     !!process.send ?
                        success > 55 ? 
                        process.send({request: 'collectionSuccess', data: datum}) :
                        process.send({request: 'collectionFailure', data: datum}) :
                        console.log('Cannot Send, its undefined.');
                }, seed);
            } else {
                process.send? process.send({request: 'haltedCollection', data: array.splice(index, array.length - index)}): console.error("unable to send halted message.");
            }
        });
        this.processActive = false;
    }

    private writeTemporaryData(data: any){
        console.log("🚀 ~ file: index.ts ~ line 155 ~ WorkerProcess ~ writeTemporaryData ~ data", data)
        console.log('Data Written')
    }
    private writeFailureData(data: any){
        console.log("🚀 ~ file: index.ts ~ line 155 ~ WorkerProcess ~ writeFailureData ~ data", data)
        console.log('Data Written')
    }

    private handleMainMessages(msg: any, handle?:any){
        const {request, data} = msg;
        console.log(`Cluster Part ${process.env.part} has received a request to process a ${request} message with data: ${data}`)
        switch(request){
            case 'processDiscovery':
                const discovery = generateRandos();
                !!process.send ? process.send({request: 'discoveryComplete', data: discovery}) : console.log('Unable to send Discovery, is the main node still alive?');
                break;
            case 'processCollectionPart':
                this.processCollection(data); 
                break;
            case 'writeData':
                this.writeTemporaryData(data);
                break;
            case 'writeFailureData':
                this.writeFailureData(data);
                break;
            case 'haltCollection':
                this.haltCollection = true;
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
} else {
    console.log(`[${process.env.part}] Now online`);
    const worker = new WorkerProcess();
}