# tapas  

Universal pub-sub-messaging and stream-plumbing solution.  
Publish and consume topics through HTTP/REST or WebSockets, persist payloads in memory, filesystem or S3-compatible storage. Subscribe to wildcard-paths to receive updates from multiple topics.  
  
Completely stream-based, i.e. WebSockets output payloads as soon as the first incoming byte arrives.  
  
## Configuration  

Use environment variables or an `.env`-file to configure tapas.  

| Variable Name | Description | Type | Required/Optional | Default Value |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------- | ------------------------ |
| ALLOW_DYNAMIC_TOPICS | Allow dynamic creation/modification/deletion of topics | stringbool | optional | true |
| ALLOW_EPHEMERAL_TOPICS | Allow ephemeral topics (see below) | stringbool | optional | true |
| ALLOW_OPPORTUNISTIC_CONNECTIONS | Allow connections that seek to consume topics which do not exist, yet (see below) | stringbool | optional | true |
| ALLOW_PING_PONG_CUSTOMIZATION | Allow per-topic customization of WebSocket ping-pong interval | stringbool | optional | true |
| CONNECTION_TIMEOUT | define global connection timeout (milliseconds), is not used for WebSocket connections past protocol-switch | number (positive integer) | optional | — |
| FALLBACK_CONTENT_TYPE | Define Content-Type used if topic doesn’t define one | string (matching MIME type formatting, i.e. “application/json”) | optional | application/octet-stream |
| FALLBACK_EXPIRATION | Define payload expiration if not defined by topic | number (positive integer) | optional | — |
| FORWARD_STRATEGY | Define forward strategy (see below) | enum-string [tee\|store-and-forward] | optional | tee |
| PERSISTENCE_TYPE | Define persistence-backend | enum-string [none\|memory\|filesystem\|s3] | optional | filesystem |
| PING_PONG_INTERVAL | Define WebSocket ping-pong-interval (milliseconds) | number (positive integer) | optional | 5000 |
| PORT | Define HTTP port | number (positive integer) | optional | 3000 |
| STDOUT_PRETTIFY | If defined, explicitly use pretty/colorized (true) or JSON-formatted (false) log output. Is auto-detected if left undefined. | stringbool | optional | — |
| TOPICS_FILE | Define path to a JSON-file for static topic definitions (see below) | string (path-like) | optional | — |
| UPLOAD_SIZE_LIMIT | Define global upload size-limit (bytes) | number (positive integer) | optional | — |
  
### For PERSISTENCE_TYPE: filesystem  

| Variable Name | Description | Type | Required/Optional | Default Value |
| ---------------- | ----------------------------------------------------------- | -------------------- | ----------------- | ------------------------ |
| PERSISTENCE_TYPE | Use filesystem persistence backend | literal “filesystem” | required | [enum member, see above] |
| FILESYSTEM_PATH | Define storage location. Creates tmpdir if left undefined. | string (path-like) | optional | — |
  
### For PERSISTENCE_TYPE: s3  

| Variable Name | Description | Type | Required/Optional | Default Value |
| ---------------- | ---------------------------------------------- | ------------ | ----------------- | ------------------------ |
| PERSISTENCE_TYPE | Use S3 persistence backend | literal “s3” | required | [enum member, see above] |
| S3_ACCESS_KEY | S3 Access Key | string | optional | — |
| S3_BUCKET | S3 Bucket | string | optional | — |
| S3_ENDPOINT | S3 Endpoint | string (URL) | required | — |
| S3_PATHSTYLE | Wether S3 client should do path-style requests | stringbool | optional | — |
| S3_REGION | S3 Region | string | required | — |
| S3_SECRET_KEY | S3 Secret Key | string | optional | — |
  
## Topic  

Topics are  the entity under which payloads are published.  
  
Topics are constructed with:  

* **id**  
  used as normalized identifier e.g. in persistence backends  
* **path**  
  used to address topic from endpoints  
* **content-type**  
  used in “content-type” headers when delivering payloads via HTTP  
* **persistence**  
  instance of the class implementing the configured persistence-type (see below)  
* **isReadOnly**  
  defines runtime behavior for static topics that are defined through topics-file (see below) or ephemeral topics (see below)  
  
### Topics File  

Static topics can be defined in a JSON-file configured through “TOPICS_FILE”, following the format  

```json
{
  "<topic UUID>": [
    ["<path element>", "<path element>", "<path element>"],
    "<MIME type>",
    true, // persist
    300000 // expire after 5 mins
  ],
  "<topic UUID>": [
    ["<path element>", "<path element>", "<path element>"],
    "<MIME type>",
    false, // do not persist
    0 // no expiration
  ]
}

```

A static topic cannot be altered or deleted.

### Ephemeral Topics  

If allowed through “ALLOW_EPHEMERAL_TOPICS”, topics can be created in an ephemeral manner, which means they only exist to publish a single payload.  
Ephemeral topics never persist their payload and cannot be altered or deleted explicitly. Their payload needs to be supplied when they’re created (POST-endpoint), it cannot be supplied later (i.e. through PUT-endpoint).  
Ephemeral topics are implicitly deleted after they have published their payload (and it has possibly been consumed).  
  
### Forward Strategy  

Given the nature of streams, forwarding payloads to multiple destinations which might read the data at different rates becomes tricky. NodeJS-stream “backpressure“ is used to control stream speed when writing payloads to persistence backends in order to avoid unnecessary memory spikes for buffering, however, when reading payload from persistence or incoming stream and potentially delivering it to multiple consumers, memory buffering becomes unavoidable.  
  
* **“FORWARD_STRATEGY=tee"** (default)  
  splits the incoming stream and buffers it in memory to live-forward to consumers  
* **“FORWARD_STRATEGY=store-and-forward”**  
  buffers the whole payload in memory before streaming it to consumers  
  
In both scenarios, “backpressure“ is still used for writing to persistence backend.  
  
## Persistence  

Payloads can be persisted using different persistence-types. Persistence can be enabled or disabled per-topic but always uses the persistence-type configured globally.  
“PERSISTENCE_TYPE=none" disables persistence globally.  
  
Persistences are constructed with:  

* **topicId**  
  used as normalized identifier to store payloads (where needed)  
* **expiration**  
  used to define after what time after last modification the payload should be discarded; implementation is backend-specific, i.e. memory-persistence purges the payload directly after a timeout is reached while s3-persistence checks expiration only on next access and deletes the object accordingly  
  
## Consumer  

When accessing payloads, Consumers are used to match against multiple topics using wildcard-paths (see below) or—if allowed through “ALLOW_OPPORTUNISTIC_CONNECTIONS”—await the existence of matching topics.  
  
Consumers are constructed with:  

* **path**  
  used to continually match against paths of existing topics  
  
### Wildcard Paths  

To match against multiple topics, a MQTT-adjacent wildcard-style can be used:  

* \+  
  matches all strings on a single path-level  
* \*  
  matches everything on subsequent path-levels  
  when used at the end of a path-element, matches own level and subsequent path-levels  
  
Given the topic paths  

* this/is/a/test  
* this/is/a/test/1  
* this/is/a/test/2  
* this/isnt/a/test  
* this/foo  
* bar  
  
Consumer paths would match like this:  

* this/is/a/test  
  * this/is/a/test  
* this/is/a/test/2  
  * this/is/a/test/2  
* this/+/a/test  
  * this/is/a/test  
  * this/isnt/a/test  
* this/is/a/test/*  
  * this/is/a/test/1  
  * this/is/a/test/2  
* this/+/a/test/*  
  * this/is/a/test/1  
  * this/is/a/test/2  
* this/+/a/test*  
  * this/is/a/test  
  * this/is/a/test/1  
  * this/is/a/test/2  
  * this/isnt/a/test  
* this/+  
  * this/foo  
* \*  
  * \<all>  
  
## Endpoints  

\<follows>  
