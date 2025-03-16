declare module globalThis {

	function sendJSBuffer(packet: ArrayBuffer) : void;
	function callUnityMethod(type: number, payload: string) : string;
	/**
	 * Request a refresh callback request, the `callback` will be called every frame
	 * @param callback The function to call when it's time to update your animation for the next repaint. The callback function is passed one single argument, a number similar to the one returned by `godot.OS.get_system_time_msecs()`, indicating the point in time when requestAnimationFrame() starts to execute callback functions.
	 */
	function requestAnimationFrame(callback: (time_stamp: number) => void): FrameRequetID;

	/**
	 * Cancel an frame request previously scheduled through a call to `godot.requestAnimationFrame()`.
	 * @param request_id The ID value returned by the call to `godot.requestAnimationFrame()` that requested the callback.
	 */
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
	}

	/**
	 * A worker is an object created using a constructor of `Worker` that runs a named JavaScript file â this file contains the code that will run in the worker thread;
	 *
	 * Workers run in another global context that is different from the current context.
	 *
	 * You can run whatever code you like inside the worker thread. All of the godot API are available inside workers.
	 *
	 * Data is sent between workers and the main thread via a system of messages â both sides send their messages using the `postMessage()` method, and respond to messages via the `onmessage` event handler (the message is contained within the Message event's data attribute.) The data is copied rather than shared.
	 *
	 * You can **transfer** value with `Worker.abandonValue` and `Worker.adoptValue`. After a value is abandoned you cannot using it anymore in the context.
	 *
	 * Workers may, in turn, spawn new workers, all sub-worker will be stopped when the host context stop.
	 */
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

		/**
		 * Sends a message to the worker's inner scope. This accepts a single parameter, which is the data to send to the worker.
		 * @param message The object to deliver to the worker; this will be in the data field in the event delivered to the `onmessage` handler.
		 * @note The data cannot be instance of `godot.Object` or any other JavaScript object contains functions.
		 */
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

