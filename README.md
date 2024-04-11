# NATS Microservice Library

![](https://img.shields.io/badge/Coverage-93%25-83A603.svg?style=flat&prefix=$coverage$)



A convenient microservice library based on NATS and compatible with nats-go microservices

## Description

This is a **typescript-first** library that provides a convinient (in 10 lines of code or less!) way to write **microservices** with out of the box **auto discovery**, **observability** and **load balancing**.

Full interoperability with [nastcli](https://github.com/nats-io/natscli) microservice-related commands like `nats micro info`, `nats micro stats` and `nats micro ping` 

It also supports service schema discovery which is not (yet?) supported by `nats micro`

## Limitations / TODO

1. Automatic type schemas and validation is incomplete
2. `InMemoryBroker` mock class does not use queue groups and thus does not load balance

## Installation

```bash
npm install nats-micro
```

The library is built in three flavours, you can use any of them: ESM, CommonJS and TypeScript typings

For main classes:
```ts
import { Broker, NatsBroker, Microservice } from 'nats-micro';
// or 
const { Broker, NatsBroker, Microservice } = require('nats-micro');
```

For decorators:
```ts
import { microservice, method } from 'nats-micro';
// or 
const { microservice, method } = require('nats-micro');
```

and so on. Everything is exported at the package root.

## Usage

Starting a microservice is extremely simple:

### Functional way
```ts
const broker = await new NatsBroker('echo' + process.pid).connect();

await Microservice.create(
  broker,
  {
    name: 'echo',
    description: 'Simple echo microservice',
    version: '0.0.1',
    methods: {
      say: {
        handler: (req: Request<string>, res: Response<string>) => {
          res.send(req.data);
        },
        // subject is autogenerated according to nats micro protocol
      },
      'config-change-event': {
        handler: (req: Request<unknown>) => {
          console.log(req.data);
        },
        // subject is manually specified which allows for broadcast
        // event bus
        subject: '$EVT.config.change',
      },
    },
  }
);
```

### Declarative way
```ts
class EchoMicroservice {
  public get config(): MicroserviceConfig {
    return {
      name: 'echo',
      description: 'Simple echo microservice',
      version: '0.0.1',
      methods: {
        say: { handler: this.say },
        'config-change-event': { handler: this.onConfigChange },
      },
    };
  }

  private say(req: Request<string>, res: Response<string>): void {
    res.send(req.data);
  }

  private onConfigChange(req: Request<unknown>): void {
    console.log(req.data);
  }
}

const echoMicroservice = new EchoMicroservice();

const broker = await new NatsBroker('echo' + process.pid).connect();
await Microservice.create(broker, echoMicroservice.config);
```

### Using decorators 
```ts
@microservice({ name: 'echo', description: 'Decorated service' })
// @microservice() // as simple as this 
export default class EchoMicroservice {

  // name is manual, subject is autodetected
  @method<string, string>({name: 'say'})   
  private reply(req: Request<string>, res: Response<string>): void {
    res.send(req.data);
  }
  
  // name is autodetected as 'config-change-event', subject is manual
  @method<unknown>({ subject: '$EVT.config.change' }) 
  private onConfigChange(req: Request<unknown>): void {
    console.log(req.data);
  }
}

const echoMicroservice = new EchoMicroservice();

const broker = await new NatsBroker('echo' + process.pid).connect();
await Microservice.createFromClass(broker, echoMicroservice);
```

## Stopping a microservice

You can easily stop a microservice
```ts
const ms = await Microservice.createFromClass(broker, echoMicroservice);
await ms.stop();
```

To start if again just use the same code as before:
```ts
await Microservice.createFromClass(broker, echoMicroservice);
```

## Getting received subject and headers

* You may need to identify what subject a message arrived at.
* You may also need to read incoming message headers

All this can be achieved in a handler method using its second argument
```ts
@method() 
private configChangeEvent(data: WhatEventTypeYouUse, payload: { subject, headers }): void {
  // ...
}
```

## Accessing a microservice underlying connection and discovery connection information

Using `Microservice.createFromClass` method gives you ability to access the microservice created and its discovery 

```ts

class EchoMicroservice {
  
  // can have any access modifier
  private __microservice: Microservice | undefined;
}

const broker = await new NatsBroker('echo' + process.pid).connect();

const echoMicroservice = new EchoMicroservice();
const microservice = await Microservice.createFromClass(broker, echoMicroservice);

// reference to the same microservice is created automatically
assert(echoMicroservice.__microservice === microservice);

console.log(`Instance ID assigned: ${echoMicroservice.__microservice.discovery.id}`);
```

## Load balancing

When you start a number of number of instances of the same microservice, normally, NATS will automatically balance any calls to the a method across all the microservice instances.

However, you can control his behavior:
```ts
@microservice()
export default class BalanceDemoMicroservice {

  @method<void, string>()
  public balanced(): Promise<string> {
    res.send('I will answer this if everyone else is slower than me');
  }

  @method<void, string>({ unbalanced: true })
  public all(_, res: Response<string>): void {
    res.send('I will answer this no matter what. Get ready for multiple answers');
  }

  @method<void, string>({ local: true })
  public local(_, res: Response<string>): void {
    res.send('You can reach me only at my local subject, no load balancing');
  }
}
```

### Balanced behavior (default)
If you call `balance-demo.balanced`, having N instances of `balance-demo` microservice, every one of them will receive and respond to every Nth call on average. The logic of load balancing is based on NATS internal "queue groups" functionality ans is described in its documentation.

### Unbalanced behavior
If you send a call to `balance-demo.all` however, it will be received and responded by **every** `balance-demo` microservice that has the `all` method.

This is useful for broadcast event buses, when you want all microservices to receive an even no matter what and possibly respond to it.

Having this utilized be ready to receiving multiple responses to a request.

### Local endpoint behavior

As for the `balance-demo.local`, there is no such subject any microservice is subcribed to. Instead instance `ID` of the `balance-demo` microservice will listen to `balance-demo.<microservice ID>.local` only. You will need to use `broker.request(..., { microservice: 'balance-demo', instance: '<microservice ID>', method: 'local' }, ...)` for that.

This feature is useful for scenarios like when you have multiple instances of the same microservice, want to discover their IDs and then address specific ones of them.

## Microservice discovery and monitoring

While you can use NATS native way to discover currently running microservices by sending messages to subject "$SRV.INFO" and collecting their responses, `nats-micro` library provides an additional convenient way of doing this.

Every nats-micro microservice will announce itself at "$SRV.REG" subject, which you can listen either manually subscribing to the subject or using `Monitor` class.

```ts
// create a new microservice monitor
// broker must be already connected by this moment
const monitor = new Monitor(broker);

// receive an event whenever a new service appears online
// or when you (re)discover it manually
monitor.on('added', (service) => console.log); 
// receive an event whenever the list of services changes
monitor.on('change', (services) => console.log); 

// manually discover all running microservices in background, 
// giving them 10 seconds to respond
monitor.discover(10000); 
// or wait for the 10 seconds in foreground
await monitor.discover(10000); 

// access the list of services collected
const servicesRunning = monitor.services; 

// note that discover() will abandon all previously collected services
// unless you instuct it explicitly
monitor.discover(10000, { doNotClear: true });

// start automatic discovery with 60 seconds interval
monitor.startPeriodicDiscovery(60000, 10000); 
// and then stop it
monitor.stopPeriodicDiscovery(); 
```

## Microservice registration and deregistration

Using `Monitor` you can not only watch for microservices coming online, but also for disconnecting ones.

For this you need a NATS server with system account configured and create two separate connections from your code: one for a usual user and one for a system user:

```ts
// both brokers must be already connected by this moment
const monitor = new Monitor(userBroker, systemBroker);

// in addition to 'change' and 'added' events 
// you can watch for microservices removed
monitor.on('removed', (service) => console.log); 
```

This code will give `Monitor` an ability to subscribe to "$SYS.ACCOUNT.*.DISCONNECT" subject and watch connections going offline. 

As every microservice created with `nats-micro` has a `_nats.client.id` value in its metadata, this allows `Monitor` to associate microservices with NATS connections and understand if they went offline when their parent broker is disconnects for whatever reason.

Having a NATS connection information also allows accessing client id, IP address, username and account name for every microservice.

## Unit tesing

If you need to unittest your code that uses `nats-miro`, there is a helpful class `InMemoryBroker` that mocks NATS connection without real NATS or even any network.

It implements the same `Broker` interface that `NatsBroker` class does and can be used in all scenarios where `NatsBroker` is used.

```ts
import { InMemoryBroker } from 'nats-micro';
// or
const { InMemoryBroker } = require('nats-micro');
```

## Middleware

You can have additional code attached to microservice calls, that is run before and/or after the method handlers.

Such code is called middleware and looks very much alike express middleware:

```ts
await Microservice.create(
  broker,
  {
    name: 'echo',
    description: 'Simple echo microservice',
    version: '0.0.1',
    methods: {
      say: {
        handler: (req: Request<string>, res: Response<string>) => {
          res.send(req.data);
        },
        middleware: [
          async (req: Request<string>, res: Response<string>) => {
            console.log('hi! this code is run BEFORE the actual handler');
          },
        ],
        postMiddleware: [
          (req: Request<string>, res: Response<string>) => {
            console.log('hi! this code is run AFTER the actual handler');
          },
        ],
      },
    },
  }
);
```

or 
```ts
@microservice()
export default class EchoMicroservice {
  @middleware.pre(myPreMiddleware)
  @middleware.pre(myAnotherPreMiddleware)
  @middleware.post(myPostMiddleware)
  @middleware.post(myAnotherPostMiddleware)
  // and/or like this
  // @middleware([...myOtherPreMiddlewares], [...myOtherPostMiddlewares])
  @method<string, string>()
  private say(req: Request<string>, res: Response<string>): void {
    res.send(req.data);
  }
}
```

Note, that *if you close `Request` in any pre-handler middleware, the handler itself and all post-handler middlewares that you might have registered, will not be executed*!