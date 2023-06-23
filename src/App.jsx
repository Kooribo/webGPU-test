import "./App.css";
import WebCanvas from "./WebCanvas";

function App() {
	return (
		<>
			<h1>WebGPU - test</h1>
			<div className="card-full">
				{!navigator.gpu ? (
					<div className="support-error">
						It seems like your current browser does{" "}
						<a
							href="https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility"
							target="_blank"
							rel="noreferrer"
						>
							not support WebGPU
						</a>
					</div>
				) : (
					<WebCanvas />
				)}
			</div>
		</>
	);
}

export default App;
