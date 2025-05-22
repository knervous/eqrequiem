declare namespace globalThis {

	function sendJSBuffer(packet: ArrayBuffer) : void;
	function callUnityMethod(type: number, payload: string) : string;
	/**
	 * Request a refresh callback request, the `callback` will be called every frame
	 */
	function requestAnimationFrame(callback: (time_stamp: number) => void): FrameRequetID;

	function cancelAnimationFrame(request_id: FrameRequetID): void;

	/**
	 * The Console API provides functionality to allow developers to perform debugging tasks, such as logging messages or the values of variables at set points in your code, or timing how long an operation takes to complete.
	 */
	const console: {
		/**
		 * Outputs a message to the console. The message may be a single string (with optional substitution values), or it may be any one or more JavaScript objects.
		 * @param message A list of JavaScript objects to output. The string representations of each of these objects are appended together in the order listed and output.
		 */
		log(...message): void;

		/**
		 * Outputs a warning message to the console.
		 * @param message  list of JavaScript objects to output. The string representations of each of these objects are appended together in the order listed and output.
		 */
		warn(...message): void;

		/**
		 * Outputs an error message to the console.
		 * @param message A list of JavaScript objects to output. The string representations of each of these objects are appended together in the order listed and output.
		 */
		error(...message): void;

		/** Outputs a stack trace to the console.
		 * @param message A list of JavaScript objects to output. The string representations of each of these objects are appended together in the order listed and output.
		*/
		trace(...message): void;

		/** Log JavaScript Objects as JSON format */
		LOG_OBJECT_TO_JSON: boolean;
	};

	class Worker {

	  /**
		 * Creates a dedicated worker thread that executes the script at the specified file
		 */
	  constructor(script: string);

	  /**
		 * The `onmessage` property of the Worker interface represents an event handler, that is a function to be called when the message event occurs.
		 * It will be called when the worker's parent receives a message from the worker context by `postMessage` method.
		 */
	  onmessage(message: Event): void;

	  postMessage(message: Event): void;

	  /**
		 * Stop the worker thread
		 */
	  terminate(): void;
	}

	/** **Worker context only**
	 *
	 *  Stop the worker thread of current context
	 */
	function close(): void;

	/** **Worker context only**
	 *
	 * The message handler to handle messages send from the host context
	 */
	function onmessage(message: Event): void;

	/** **Worker context only**
	 *
	 * Sends a message to the host thread context that spawned it.
	 *
	 * @param {*} message The message to send
	 */
	function postMessage(message: Event): void;

	/** **Worker context only**
	 *
	 * Synchronously load and run one or more scripts in the worker thread.
	 */
	function importScripts(...scripts: string[]): void;

	/** **Worker context only**
	 *
	 * The flag is `true` if current context is inside a worker thread.
	 */
	const INSIDE_WORKER: true | undefined;
}

