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
}

class Discovery{
    discoveredData: Collection[];
    constructor(){
        this.discoveredData = this.generateRandos();
    }

    private generateRandos(): Collection[]{
        const dat = [];
        const seed = (Math.floor(Math.random()) * 100);
        for(let i =0; i<seed;i++){
            dat.push({
                foo: Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5),
                bar: Math.floor(Math.random()) * 100,
                baz: new Date()
            });
        }
        return dat;
    }
}
if(cluster.isMaster){
    const workers: Worker[] = []
    for(let i=0; i < CLUSTER_SIZE; i++){
        // workers.push(cluster.fork({part: i}));
        const worker = cluster.fork({part: i});
        worker.on('message', (msg) => {
            console.log(msg);
            const {data} = msg;
            switch(data.request){
                case 'discoveryComplete':
                    console.log('discovery Processed.');
                    console.log(data.data);
                    break;
                default:
                    console.log('no action required for this message type.');
            }
        });
        workers.push(worker);
    }
    cluster.once('ready', (worker) => {
        console.log('parent received a ready signal');
    })
    // while()
    // cluster.workers[0] ? cluster.workers[0].send({request: 'processDiscovery'}) : (() => {
    //     console.error(`workers are not initialized.`);
    //     process.exit(1);
    // })();
    // cluster.on('discoveryComplete', )  
} else {
    console.log(`[${process.env.part}] Now online`);
    if(Number(process.env.part) === 0){
        console.log(`starting discovery on worker ${process.getegid()} ${process.geteuid()} ${process.env.id}`);
        const discovery = new Discovery().discoveredData;
        !!process.send ? process.send({request: 'discoveredData', data: discovery}): console.error('unable to send master message because send is not defined on process in this instance.');
    }
    // process.emit('ready');
    process.on('message', (msg) => {

    });
}