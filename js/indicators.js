(function (HC) {
		/***
		
		Each indicator requires mothods:
		
		- getDefaultOptions() 							- returns object with default parameters, like period etc.
		- getValues(chart, series, options) - returns array of calculated values for indicator
		- getGraph(chart, series, options) 	- returns path, or columns as SVG elemnts to add.
																					Doesn't add to chart via renderer! 
		
		***/
		
		/***
		indicators: [{
		    id: 'series-id',
		    type: 'sma',
		    params: {
		        period: 'x',
		        n: 'y'
		    },    
		    styles: {
		        lineWidth: 'x',
		        strokeColor: 'y'
		    }
		}]
		
		***/
		
		
		
		var UNDEFINED,
				Chart = HC.Chart,
				Axis = HC.Axis,
				extend = HC.extend,
				each = HC.each,
				merge = HC.merge,
        mathMax = Math.max;

		
		function error(name) {
				if(window.console){
						console.error(name);
				}
		}
		
		function defined(obj) {
			return obj !== UNDEFINED && obj !== null;
		}
		
		function forceRedraw(s){
				if(s.indicators) {
						each(s.indicators, function(el, i) {
								el.isDirty = true;
						});
						each(s.chart.yAxis, function(el, i) {
								el.render();
						});
						//s.indicators = null;
				}
		}

		HC.isArray = function(obj) {
			return Object.prototype.toString.call(obj) === '[object Array]';
		};

		HC.isObject = function(obj) {
			return typeof obj === 'object';
		};

		HC.splat = function (obj) {
			return HC.isArray(obj) ? obj : [obj];
		};
		
		HC.setOptions({
				tooltip: {
						followPointer: true
				}
		});

		
		/***
		
		Wrappers:
		
		***/
		
		/*
		*  Remove corresponding indicators for series
		*/
		HC.wrap(HC.Series.prototype, 'update', function(proceed, redraw, animation) {
				var tempIndics = [],
						s = this,
						tmpAxis, len, el;
						
				if(s.indicators) {
						len = s.indicators.length;
						while(len--) { // #21
								el = s.indicators[len];
								tempIndics.push(el.options);
								el.destroy();
						};
						proceed.call(this, redraw, animation);
						s = this; // get series reference back after update
						len = tempIndics.length;
						while(len--) { // #21
							s.chart.addIndicator(tempIndics[len]);
						};
				} else {
						proceed.call(this, redraw, animation);
				}
		});
		
		/*
		*  Remove corresponding indicators for series
		*/
		HC.wrap(HC.Series.prototype, 'remove', function(proceed, redraw, animation) {
				var s = this,
					len = s.indicators.length;
						while(len--) { // #21
							s.indicators[len].destroy();
						};
						s.indicators = null;
						
				proceed.call(this, redraw, animation);
		});
		
		/*
		*  Force redraw for indicator with new data
		*/
		HC.wrap(HC.Series.prototype, 'setData', function(proceed, redraw, animation) {
				forceRedraw(this);
				if(this.chart.alignAxes) {
						this.chart.updateHeightAxes(20, false);
				}
				proceed.call(this, redraw, animation);
		});
		
		/*
		*  Force redraw for indicator when new point is added
		*/
		HC.wrap(HC.Series.prototype, 'addPoint', function(proceed, options, redraw, shift, animation) {
				var tempIndics = [],
						s = this;
						
				if(s.indicators) {
						each(s.indicators, function(el, i) {
								tempIndics.push(el.options);
								el.destroy();
						});
						s.indicators = null;
				}
				proceed.call(this, options, redraw, shift, animation);
				
				s = this;

				each(tempIndics, function(el, i){
						s.chart.addIndicator(el);
				});
		});
		
		
		/*
		*  Set visibility to true, but disable tooltip when needed. Required for forcing recalculation of values 
		*/
		HC.wrap(HC.Series.prototype, 'setVisible', function(proceed, vis, redraw) {
				var newVis = vis === UNDEFINED ? ( this.isVisible === UNDEFINED ? !this.visible : !this.isVisible) : vis,
						showOrHide = newVis ? 'show' : 'hide',
						series = this;
						
				if(series.indicators) { 
					series.isVisible = newVis;
					series.hideInTooltip = !newVis;
					proceed.call(series, true, true); 
					if(series.chart.legend && series.chart.legend.options.enabled) { // #20
							series.chart.legend.colorizeItem(this, newVis);
					}

					// show or hide elements
					each(['group', 'dataLabelsGroup', 'markerGroup', 'tracker'], function (key) {
						if (series[key]) {
							series[key][showOrHide]();
						}
					});
					series.visible = true;
				}	else {
						proceed.call(series, newVis, true);
				}
		});
		
		/*
		*  Force redraw for indicator with new point options, like value
		*/
		HC.wrap(HC.Point.prototype, 'update', function(proceed, options, redraw) {
				var tempIndics = [],
						s = this;
						
				if(s.indicators) {
						each(s.indicators, function(el, i) {
								tempIndics.push(el.options);
								el.destroy();
						});
						s.indicators = null;
				}
				proceed.call(this, options, redraw);
				
				s = this;

				each(tempIndics, function(el, i){
						s.chart.addIndicator(el);
				});
		});
		
		/*
		*  Force redraw for indicator when one of points is removed
		*/
		HC.wrap(HC.Point.prototype, 'remove', function(proceed, options, redraw, animation) {
				forceRedraw(this.series);
				proceed.call(this, options, redraw);
		});
		
    /*
    *  Set flag for hasData when indicator has own axis
    */
    HC.wrap(HC.Axis.prototype, 'render', function(p) {
    		function manageIndicators() {
    				var hasData = false,
    						indMin = Infinity,
    						indMax = -Infinity;
						each(this.indicators, function(ind, i) {
								if(ind.visible) {
										hasData = true; 
										indMin = Math.min(indMin, ind.options.yAxisMin);
										indMax = Math.max(indMax, ind.options.yAxisMax);
								}
						});
						if(hasData) {
								this.isDirty = true;
								this.isDirtyExtremes = true;
								this.userMax = indMax;
								this.userMin = indMin;
						} else {
								this.userMax = null;
								this.userMin = null;
						}
						return hasData;
    		}
				if(this.indicators && !this.hasVisibleSeries) {
						// case 1: axis doesn't have series
						this.hasData = manageIndicators.call(this);
						
						if(this.hasData) {
								this.setScale();
								this.setTickPositions(true);  
		
								this.chart.getMargins();
								HC.each(this.indicators, function(ind, e) {
									ind.drawGraph();
								});
						}
				} else if(this.indicators) {
						// case 2: right now all series are 'visible', so we need to check param: isVisible
						var hasData = false;
						
						each(this.series, function(serie, i) {
								if(serie.isVisible || (serie.isVisible === UNDEFINED && serie.visible)) {
									hasData = true;	
								}
						});
						
						if(!hasData) {
								hasData = manageIndicators.call(this);
						} else {
								this.userMax = null;
								this.userMin = null;
						}
						if(hasData) {
								this.setScale();
								this.setTickPositions(true); 
						
								this.chart.getMargins();
						}
						this.hasData = hasData;
						
						HC.each(this.indicators, function(ind, e) {
							ind.drawGraph();
						});
				}
    		p.call(this);
    });

    
    /*
		*		Tooltip formatter content
		*/
		HC.wrap(HC.Tooltip.prototype, 'defaultFormatter', function (proceed, tooltip) {

			var items 		   = this.points || HC.splat(this),
				chart 		   = items[0].series.chart,
				x 			   = this.x,
				tooltipOptions = chart.tooltip.options,
				s;

			// build the header
			s = [tooltip.tooltipFooterHeaderFormatter(items[0])]; //#3397: abstraction to enable formatting of footer and header

			// build the values
			s = s.concat(tooltip.bodyFormatter(items));

			// footer
			s.push(tooltip.tooltipFooterHeaderFormatter(items[0], true)); //#3397: abstraction to enable formatting of footer and header

			return s.join('');

		});

		HC.wrap(HC.Tooltip.prototype, 'bodyFormatter', function (proceed, items) {
			return HC.map(items, function (item) {
	            var tooltipOptions = item.series.tooltipOptions;
	            return (tooltipOptions.pointFormatter || item.point.tooltipFormatter).call(item.point, tooltipOptions.pointFormat);
	        });
		});

		/*
			Tooltip pointFormat
		*/
		
		HC.wrap(HC.Point.prototype, 'tooltipFormatter', function (proceed, pointFormat) {

			// Insert options for valueDecimals, valuePrefix, and valueSuffix
			var series = this.series,
				indicators 	   = series.chart.indicators.allItems,
				seriesTooltipOptions = series.tooltipOptions,
				tooltipOptions = series.chart.tooltip.options,
				valueDecimals = HC.pick(seriesTooltipOptions.valueDecimals, ''),
				valuePrefix = seriesTooltipOptions.valuePrefix || '',
				valueSuffix = seriesTooltipOptions.valueSuffix || '',
				x = this.x,
				graphLen = 0,
				indLen = 0,
				indTooltip,
				indPointFormat,
				k;
			
			// Loop over the point array map and replace unformatted values with sprintf formatting markup
			HC.each(series.pointArrayMap || ['y'], function (key) {
				key = '{point.' + key; // without the closing bracket
				if (valuePrefix || valueSuffix) {
					pointFormat = pointFormat.replace(key + '}', valuePrefix + key + '}' + valueSuffix);
				}
				pointFormat = pointFormat.replace(key + '}', key + ':,.' + valueDecimals + 'f}');
			});

			if(indicators && indicators !== UNDEFINED && tooltipOptions.enabledIndicators) {
				
				// build the values of indicators
				HC.each(indicators,function(ind,i) {
					if(typeof(ind.values) === 'undefined' || ind.visible === false) {
						return;
					}

					HC.each(ind.currentPoints,function(val, j){
						if(val[0] === x) {

							if(ind.options.tooltip) {

								indLen = val.length;
								indTooltip = ind.options.tooltip;
								indPointFormat = indTooltip.pointFormat;

								pointFormat += HC.format(indPointFormat, {
									point: {
										bottomColor: indLen > 3 ? ind.graph[2].element.attributes.stroke.value : '',
										bottomLine: HC.numberFormat(val[3],3),
										x: val[0],
										y: indLen > 3 ? HC.numberFormat(val[2],3) : HC.numberFormat(val[1],3),
										color: indLen > 3 ? ind.graph[1].element.attributes.stroke.value : ind.graph[0].element.attributes.stroke.value,
										topLine: HC.numberFormat(val[1],3),
										topColor: ind.graph[0].element.attributes.stroke.value
									},
									series:ind
								});

							} else {

								//default format
								graphLen = ind.graph.length;
								for(k = 0; k < graphLen; k++) {
									pointFormat += '<span style="font-weight:bold;color:' + ind.graph[k].element.attributes.stroke.value + ';">' + HC.splat(ind.options.names || ind.name)[k] + '</span>: ' + HC.numberFormat(val[k+1],3) + '<br/>';
								}
							}
						}
					});
				});
			}

			return HC.format(pointFormat, {
				point: this,
				series: this.series
			});
		});

		/***
		
		Add legend items:
		
		***/
		
		
		/* 
		* Add indicators to legend
		*/
		HC.wrap(HC.Legend.prototype, 'getAllItems', function(p) {
				var allItems = p.call(this),
						indicators = this.chart.indicators;
				if(indicators) {
						HC.each(indicators.allItems, function(e, i) {
								if(e.options.showInLegend) {
										allItems.push(e);
								}
						});
				}
				return allItems;
		});
		
		
		/*
		* Render indicator
		*/
		HC.wrap(HC.Legend.prototype, 'renderItem', function(p, item) {
				if(item instanceof Indicator) {
						var series = item.series;
						item.series = null;
						item.color = item.options.styles.stroke;
						p.call(this, item);
						item.series = series;
				} else {
						p.call(this, item);
				}
		});


/////////
	HC.wrap(HC.Point.prototype, 'getLabelConfig', function(proceed, point, mouseEvent) {
		var point = this;

		return {
			x: point.category,
			y: point.y,
			indicators: point.indicators,
			key: point.name || point.category,
			series: point.series,
			point: point,
			percentage: point.percentage,
			total: point.total || point.stackTotal
		};
	});

	HC.wrap(HC.Point.prototype, 'init', function(proceed, series, options, x) {
		var point = this,
			colors;

		point.series = series;
		point.color = series.color; // #3445
		point.applyOptions(options, x);
		point.pointAttr = {};
		point.indicators = {};

		if (series.options.colorByPoint) {
			colors = series.options.colors || series.chart.options.colors;
			point.color = point.color || colors[series.colorCounter++];
			// loop back to zero
			if (series.colorCounter === colors.length) {
				series.colorCounter = 0;
			}
		}

		series.chart.pointCount++;
		return point;
	});
////////////
		
		/* 
		* When hovering legend item, use isVisible instead of visible property
		*/ 
		
		HC.wrap(HC.Legend.prototype, 'setItemEvents', function(p, item, legendItem, useHTML, itemStyle, itemHiddenStyle) {
				p.call(this, item, legendItem, useHTML, itemStyle, itemHiddenStyle);
				(useHTML ? legendItem : item.legendGroup).on('mouseout', function () {
						var style = item.isVisible === UNDEFINED ? 
												(item.visible ? itemStyle : itemHiddenStyle) : (item.isVisible ? itemStyle : itemHiddenStyle);
						legendItem.css(style);
						item.setState();
				})
		});
		
		/***
		
		Indicator Class:
		
		***/
				
		Indicator = Indicator = function () {
			this.init.apply(this, arguments);
		};
		
		Indicator.prototype = {
			/* 
			* Initialize the indicator
			*/
			init: function (chart, options) {
				// set default params, when not specified in params
				if(!Indicator.prototype[options.type]) error("Indicator: " + options.type + " not found!");
				options.params = merge({}, Indicator.prototype[options.type].getDefaultOptions(), options.params);
	
				this.chart = chart;
				this.options = options;
				this.series = chart.get(options.id);
				this.name = options.name === UNDEFINED ? options.type : options.name;
				this.visible = options.visible === UNDEFINED ? true : options.visible;

				if(!this.series.indicators) {
						this.series.indicators = [];
				}
				this.series.indicators.push(this);
			},
			
			/*
			* Render the indicator
			*/
			render: function (redraw) {
				var indicator = this,
						chart = this.chart,
						renderer = chart.renderer,
						graph = this.graph,
						group = this.group,
						options = this.options,
						series = this.series,
						clipPath = this.clipPath,
						visible = options.visible,
						pointsBeyondExtremes,
						arrayValues,
						extremes;

				if(!indicator.visible) return;		
						
				if (!group) {
						indicator.group = group = renderer.g().add(chart.indicators.group);
				}
				
				if(!series) {
						error('Series not found');
						return false;
				} else if(!graph) {
						this.pointsBeyondExtremes = pointsBeyondExtremes = this.groupPoints(series);


						arrayValues = Indicator.prototype[options.type].getValues(chart, series, options, pointsBeyondExtremes);
						if(!arrayValues) { //#6 - create dummy data 
							arrayValues = {
								values: [[]],
								xData: [[]],
								yData: [[]]
							};
						}
						this.values = this.currentPoints = arrayValues.values;
						this.xData = arrayValues.xData;
						this.yData = arrayValues.yData;
						this.graph = graph = Indicator.prototype[options.type].getGraph(chart, series, options, this.values);
						
						if(graph) {

							var len = graph.length,
								i;

							for(i = 0; i < len ;i++) {
								graph[i].add(group);
							}
						}
						if(indicator.options.Axis) {
								indicator.options.Axis.indicators = indicator.options.Axis.indicators || [];
								indicator.options.Axis.indicators.push(indicator);
								if(indicator.clipPath) indicator.clipPath.destroy();
								indicator.clipPath = renderer.clipRect({
										x: indicator.options.Axis.left,
										y: indicator.options.Axis.top,
										width: indicator.options.Axis.width,
										height: indicator.options.Axis.height
								});
								group.clip(indicator.clipPath);
						}
				}
				if(chart.legend && chart.legend.options.enabled) {
						chart.legend.render();
				}
			},

			/*
			* Redraw the indicator 
			*/
			redraw: function () {
				var options = this.options,
						chart = this.chart,
						series = this.series,
						graph = this.graph,
						group = this.group,
						isDirty = this.isDirty,
						visible = options.visible,
						axis = options.Axis,
						pointsBeyondExtremes,
						arrayValues,
						extremes;
						
				if(!this.visible) {
					// remove extremes
					options.yAxisMax = null;
					options.yAxisMin = null;
					this.values = [[]];
					return;				
				}
					
				this.pointsBeyondExtremes = pointsBeyondExtremes = this.groupPoints(series);
				arrayValues = Indicator.prototype[options.type].getValues(chart, series, options, pointsBeyondExtremes);
                   
				if(!arrayValues) { //#6 - create dummy data 
						arrayValues = {
								values: [[]],
								xData: [[]],
								yData: [[]]
						}
				}
				this.values = this.currentPoints = arrayValues.values;
				this.xData = arrayValues.xData;
				this.yData = arrayValues.yData;
			},	
			
			/*
			* Draw graph
			*/
			drawGraph: function() {
				var ind = this,
					graph = this.graph,
					len = graph.length,
					i;
						
				if(graph) {

						for(i = 0; i < len ;i++) {
								graph[i].destroy();
						}
				}
				ind.graph = Indicator.prototype[ind.options.type].getGraph(ind.chart, ind.series, ind.options, ind.values);
		
				if(ind.graph) {

							for(i = 0; i < len ;i++) {
								ind.graph[i].add(ind.group);
							} 

							ind.clipPath.attr({
									x: ind.options.Axis.left,
									y: ind.options.Axis.top,
									width: ind.options.Axis.width,
									height: ind.options.Axis.height
							});   
						
				}
			},
			
			preprocessData: function(){
				this.redraw();
			},
			
			/*
			* Group points to allow calculation before extremes
			*/
			groupPoints: function(series) {
					var points = [[], []],
						start = end = series.cropStart,
						length = HC.splat(this.options.params.period)[0]; //#23 - don't use cropShould - it's broken since v1.3.6
							
					if(series.currentDataGrouping) {
							var xMax = series.xData[end],
									range = series.currentDataGrouping.totalRange,
									xMin = xMax - 2*range,
									processedXData = [],
									processedYData = [],
									actX = series.xData[0],
									preGroupedPoints = [],
									groupedPoint,
									pLen = 0,
									i = 0;
									
							if(range == series.closestPointRange && 1 == 0) {
							// we don't need grouping, since one point is the same as grouped point
								points[0] = series.xData.slice(Math.max(0, end - length), end); //#23
								points[1] = series.yData.slice(Math.max(0, end - length), end); //#23

							} else {
								// group points
								while(length >= 0 && end > 0){
										//get points in range
										preGroupedPoints = this.gatherPoints(series.xData, series.yData, xMin, xMax, end);
										pLen = preGroupedPoints.x.length; 
										if(pLen > 0){
												length --;
												groupedPoint = this.groupPoint(preGroupedPoints, series);
												points[0].push(groupedPoint[0][0]);
												points[1].push(groupedPoint[1][0]);
										}
										// change extremes for next range
										end -= pLen;
										xMax = xMin;
										xMin -= range;
								}
								if(points[0].length > 0) {
										points.sort(function(a,b) { return a[0][0] - b[0][0]; });
								}
							}
					} else {
						points[0] = series.xData.slice(Math.max(0, end - length - 1), end); //#23
						points[1] = series.yData.slice(Math.max(0, end - length - 1), end); //#23
					}

					return points;
					
			},
			
			/*
			* Group points into array for grouping
			*/
			gatherPoints: function(xData, yData, min, max, end){
					var x = [],
							y = [],
							middle = [max - (max - min) / 2];
					
					while(end >= 0 && max > min) {
								end--;
								max = max - (max - xData[end]); 
								x.push(xData[end]);
								y.push(yData[end]);
					}
					return {x: x, y: y, middle: middle};
			},
			
			/*
			* Group points to get grouped points beyond extremes
			*/
			groupPoint: function(points, series) {
				var grouped = series.groupData.apply(series, [points.x, points.y, points.middle, series.options.dataGrouping.approximation ]);
				return grouped;
			},
			
			/*
			* Destroy the indicator
			*/
			destroy: function (redraw) {
				var indicator = this,
						chart = this.chart,
						allItems = chart.indicators.allItems,
						index = allItems.indexOf(indicator),
						Axis = this.options.Axis;
				
				// remove from all indicators array
				if (index > -1) {
					allItems.splice(index, 1);
				}
				// remove from series.indicators
				index = indicator.series.indicators.indexOf(indicator);
				if(index > -1) {
						indicator.series.indicators.splice(index, 1);
				}

				// remove from yAxis.indicators
				index = Axis.indicators.indexOf(indicator);
				if(index > -1) {
						Axis.indicators.splice(index, 1);
				}
				
				if(indicator.legendGroup) {
						indicator.legendGroup.destroy();
						if(chart.legend && chart.legend.options.enabled) {
								chart.legend.render();
						}
				}
				
				//remove axis if that was the last one indicator
				if(Axis && Axis.series.length === 0 && Axis.indicators && Axis.indicators.length === 0) {
					Axis.remove();
					this.options.Axis = UNDEFINED;
					chart.indicators.haveAxes --; // #18: decrement number of axes to be updated		
					if(chart.alignAxes) {
							chart.updateHeightAxes(20, false, true);
					}
				}
				
				// remove group with graph
				if (indicator.group) {
					indicator.group.destroy();
					indicator.group = null;
				}
				indicator = null;
				chart.redraw(redraw);
			},
			
			/*
			* setState for indicator?
			*/
			setState: function(state) {
				
			},
			
			/*
			* Hide or show indicator
			*/
			setVisible: function(vis, redraw) {
				var indicator = this,
						oldVis = indicator.visible,
						newVis,
						method;
				
				if(vis === UNDEFINED) {
						newVis = oldVis ? false : true;
						method = oldVis ? 'hide' : 'show';
				} else {
						newVis = vis;
						method = vis ? 'show' : 'hide';
				}	
				
				if (this.options.showInLegend) {
						this.chart.legend.colorizeItem(this, newVis);
				}
				this.visible = newVis;
				
				indicator[method]();
				indicator.preprocessData();
				
				// hide axis by resetting extremes
				if(this.options.Axis) {
						this.options.Axis.render();
				}
				
			}, 
			
			/*
			* Draw symbol in legend - should be simple line
			*/ 
			
			drawLegendSymbol: function(legend) {
					var options = this.options,
							markerOptions = options.marker,
							radius,
							legendOptions = legend.options,
							legendSymbol,
							symbolWidth = legend.symbolWidth,
							renderer = this.chart.renderer,
							legendItemGroup = this.legendGroup,
							verticalCenter = legend.baseline - Math.round(renderer.fontMetrics(legendOptions.itemStyle.fontSize, this.legendItem).b * 0.3),
							attr;
				
					// Draw the line
					attr = {
						'stroke-width': options.lineWidth || 2
					};
					if (options.styles && options.styles.dashstyle) {
						attr.dashstyle = options.styles.dashstyle;
					}
					this.legendLine = renderer.path([
						'M',
						0,
						verticalCenter,
						'L',
						symbolWidth,
						verticalCenter
					])
					.attr(attr)
					.add(legendItemGroup);
			},
			
			/*
			* Update the indicator with a given options
			*/
			update: function (options, redraw) {
				merge(true, this.options, options);
				
				this.redraw(redraw);
				this.options.Axis.render();
			},
			
			/*
			* Hide the indicator
			*/
			hide: function() {
					this.group.hide();
					this.visible = false;
			},
			
			/*
			* Show the indicator
			*/
			show: function() {
					this.group.show();
					this.visible = true;
			}
		};
		
		
	
		// Add indicator methods to chart prototype
		extend(Chart.prototype, {
				/*
				* Adding indicator to the chart
				*/
				addIndicator: function (options, redraw) {
					var chart = this,
							indicators = chart.indicators.allItems,
							item;

					item = new Indicator(chart, options);
					indicators.push(item);
					item.render(redraw);
					chart.redraw(redraw);
				},
				/*
				 * Redraw all indicators, method used in chart events
				 */
				redrawIndicators: function () {
						var chart = this;
						
						each(this.indicators.allItems, function (indicator) {
									indicator.preprocessData();
						});
						// we need two loops - one to calculate values and register extremes
						// and second to draw paths with proper extremes on yAxis
						each(this.yAxis, function (axis) {
									axis.render();
						});
						
				},
				/*
				 * updates axes and returns new and normalized height for each of them. 
				 */
				updateHeightAxes: function(topDiff, add, afterRemove) {
						var chart = this,
								chYxis = chart.yAxis,
                len = calcLen = chYxis.length,
                i = 0,
                sum = chart.chartHeight - chart.plotTop - chart.marginBottom, //workaround until chart.plotHeight will return real value
                indexWithoutNav = 0,
                newHeight,
                top;
                
            // #18 - don't update axes when none of indicators have separate axis 
            if(afterRemove !== true && (!chart.indicators || chart.indicators.haveAxes == 0 || chart.indicators.allItems.length === 0)) return;   
                
            // when we want to remove axis, e.g. after indicator remove
            // #17 - we need to consider navigator (disabled vs enabled) when calculating height in advance
            if(!add && chart.options.navigator.enabled) { 
            	calcLen--; 
            } else if(!chart.options.navigator.enabled){
            	calcLen++;
            }
            
						newHeight = (sum - (calcLen-1) * topDiff) / calcLen;
            //update all axis
            for (;i < len; i++) {
                var yAxis = chYxis[i];
                
                if(yAxis.options.id !== 'navigator-y-axis') {
                		top = chart.plotTop + indexWithoutNav * (topDiff + newHeight);
                        
										if(yAxis.top !== top || yAxis.height !== newHeight) {
												chYxis[i].update({
														top: top,
														height: newHeight
												}, false);
										}
                		indexWithoutNav++;
                } 
            }
            return newHeight;
				}
		});
		
		// Add yAxis as pane
		extend(Axis.prototype, {
				/* 
				 * When new indicator is added, sometimes we need new pane. 
				 * Note: It automatically scales all of other axes unless alignAxes is set to false.
				 */
				addAxisPane: function(chart, userOptions) {
						chart.indicators.haveAxes++;	// #18: increment number of axes
					
						var topDiff = 20,
								height,
								yLen = chart.options.navigator.enabled ? chart.yAxis.length - 1 : chart.yAxis.length, // #17 - don't count navigator
								defaultOptions,
							  options;
								
						if(chart.alignAxes) {
							height = chart.updateHeightAxes(topDiff, true),
							defaultOptions = {
										labels: {
												align: 'left',
												x: 2,
												y: -2
										},
										offset: chart.alignAxes ? 0 : null,
										height: height,
										top: chart.plotTop + yLen * (topDiff + height) ,
										min: 0,
										max: 100
								};
						} else {
								defaultOptions = {
										min: 0,
										max: 100
								};
						}
						
						options = merge(defaultOptions,userOptions);
						
						//add new axis
						chart.preventIndicators = true;
						chart.addAxis(options, false, true, false);
						return chart.yAxis.length - 1;
				},
				
				minInArray: function(arr) {
						return arr.reduce(function(min, arr) {
								return Math.min(min, arr[1]);
						}, Infinity);
				},
				maxInArray: function(arr) {
						return arr.reduce(function(max, arr) {
								return Math.max(max, arr[1]);
						}, -Infinity);
				}
		});
		
		// Initialize on chart load
		Chart.prototype.callbacks.push(function (chart) {
        var options = chart.options.indicators,
        		optionsLen = options ? options.length : 0,
        		i = 0,
						group,
						exportingFlag = true;
						
        group = chart.renderer.g("indicators");
        group.attr({
        		zIndex: 2
        });
        group.add();
        
        if(!chart.indicators) chart.indicators = {};
        
        // initialize empty array for indicators
        if(!chart.indicators.allItems) chart.indicators.allItems = [];
        
        
        // link chart object to indicators
        chart.indicators.chart = chart;
        
        // link indicators group element to the chart
        chart.indicators.group = group;
        
        // counter for axes #18
        chart.indicators.haveAxes = 0;
        chart.alignAxes = defined(chart.options.chart.alignAxes) ? chart.options.chart.alignAxes : true;
        
        for(i = 0; i < optionsLen; i++) {
        		chart.addIndicator(options[i], false);
        		if((chart.get(options[i].id).data.length - 1) <= options[i].params.period)
        			exportingFlag = false;
        }
        
				 // update indicators after chart redraw
				Highcharts.addEvent(chart, 'redraw', function () {
						if(!chart.preventIndicators) {
							chart.redrawIndicators();
						}
						chart.preventIndicators = false;
				});
				  
				if(exportingFlag && chart.series && chart.series.length > 0) { // #16
						chart.isDirtyLegend = true;
					  chart.series[0].isDirty = true;
					 	chart.series[0].isDirtyData = true;
					 	chart.redraw(false);
				}
		});


})(Highcharts);
