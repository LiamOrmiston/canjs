steal("can/util","can/compute","can/compute/get_value_and_bind.js",function(can,compute, ObservedInfo){
	// The goal of this is to create a high-performance compute that represents a key value from can.view.Scope.
	// If the key value is something like {{name}} and the context is a can.Map, a faster
	// binding path will be used where new rebindings don't need to be looked for with every change of 
	// the observable property.
	// However, if the property changes to a compute, then the slower `can.compute.read` method of
	// observing values will be used.
	
	
	var isFastPath = function(computeData){
		return computeData.reads &&
					// a single property read
					computeData.reads.length === 1 &&
					// on a map
					computeData.root instanceof can.Map &&
					// that isn't calling a function
					!can.isFunction(computeData.root[computeData.reads[0].key]);
	};
	
	
	var getValueAndBindSinglePropertyRead = function(readInfo, computeData, singlePropertyReadChanged){
		var target = computeData.root,
			prop = computeData.reads[0].key;
		target.bind(prop, singlePropertyReadChanged);
		readInfo.value = computeData.initialValue;
	};
	var unbindSinglePropertyRead = function(computeData, singlePropertyReadChanged){
		computeData.root.unbind(computeData.reads[0].key, singlePropertyReadChanged);
	};
	var scopeReader = function(scope, key, options, computeData, newVal){
		if (arguments.length > 4) {
			scope.write(key, newVal, computeData, options);
		} else {
			// If computeData has found the value for the key in the past in an observable then go directly to
			// the observable (computeData.root) that the value was found in the last time and return the new value.  This
			// is a huge performance gain for the fact that we aren't having to check the entire scope each time.
			if (computeData.root) {
				return can.compute.read(computeData.root, computeData.reads, options)
					.value;
			}
			// If the key has not already been located in a observable then we need to search the scope for the
			// key.  Once we find the key then we need to return it's value and if it is found in an observable
			// then we need to store the observable so the next time this compute is called it can grab the value
			// directly from the observable.
			var data = scope.read(key, options);
			computeData.scope = data.scope;
			computeData.initialValue = data.value;
			computeData.reads = data.reads;
			computeData.root = data.rootObserve;
			computeData.setRoot = data.setRoot;
			return data.value;
		}
	};
	
	return function(scope, key, options){
		options = options || {
			args: []
		};
		// the object we are returning
		var computeData = {},
			// a function that can be passed to getValueAndBind, or used as a setter
			scopeRead = function (newVal) {
				if(arguments.length) {
					return scopeReader(scope, key, options, computeData, newVal);
				} else {
					return scopeReader(scope, key, options, computeData);
				}
			},
			
			// What to do when a single property has changed
			singlePropertyReadChanged = function(ev, newVal, oldVal){
				if(typeof newVal !== "function") {
					compute.computeInstance.updater(newVal, oldVal, ev.batchNum);
				} else {
					// switch bindings
					unbindSinglePropertyRead(computeData,singlePropertyReadChanged );
					readInfo.getValueAndBind();
					isFastPathBound = false;
					compute.computeInstance.updater(readInfo.value, oldVal, ev.batchNum);
				}
			},
			// tracks if we are in the fast path or not
			isFastPathBound = false,
			
			compute = can.compute(undefined,{
				on: function() {
					// 
					readInfo.getValueAndBind();
					
					if( isFastPath(computeData) ) {
						// bind before unbind to keep bind count correct
						getValueAndBindSinglePropertyRead(readInfo, computeData, singlePropertyReadChanged);
						readInfo.teardown();
						// clear newObserved so if this switches back, we're ok with it
						readInfo.newObserved = {};
						isFastPathBound = true;
					}
					// TODO deal with this right
					compute.computeInstance.value = readInfo.value;
					compute.computeInstance.hasDependencies = isFastPathBound || !can.isEmptyObject(readInfo.newObserved);
				},
				off: function(){
					if(isFastPathBound) {
						unbindSinglePropertyRead(computeData, singlePropertyReadChanged);
					} else {
						readInfo.teardown();
					}
				},
				set: scopeRead,
				get: scopeRead,
				// a hack until we clean up can.compute for 3.0
				__selfUpdater: true
			}),
			
			// the observables read by the last calling of `scopeRead`
			readInfo = new ObservedInfo(scopeRead, null, compute.computeInstance);
		
		computeData.compute = compute;
		return computeData;
		
	};
});
