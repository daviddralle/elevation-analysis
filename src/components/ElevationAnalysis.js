// src/components/ElevationAnalysis.js
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';

const ElevationAnalysis = () => {
  const [data, setData] = useState({
    byYearSite: {},
    differencesBySite: {},
    integralBySite: {},
    sites: [],
    isLoading: true,
    error: null
  });
  
  const [selectedSites, setSelectedSites] = useState([]);
  
  // Define colors for years
  const yearColorMap = {
    2021: '#8884d8',
    2024: '#ff7300'
  };
  
  // Define colors for sites
  const colorMap = {
    'AHA': '#1f77b4',
    'FAL': '#ff7f0e',
    'LGR': '#2ca02c',
    'MCC': '#d62728',
    'MID': '#9467bd'
  };
  
  useEffect(() => {
    const loadData = async () => {
      try {
        // Try different possible file paths
        let fileContent;
        try {
          const response = await fetch(`${process.env.PUBLIC_URL}/data/LongPro_Comparison.csv`);
          if (!response.ok) throw new Error('Path not found');
          fileContent = await response.text();
        } catch (e) {
          // Try alternative path
          const altResponse = await fetch(`${process.env.PUBLIC_URL}/LongPro_Comparison.csv`);
          if (!altResponse.ok) throw new Error('No file found in either location');
          fileContent = await altResponse.text();
        }
        
        Papa.parse(fileContent, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            processData(results.data);
          },
          error: (error) => {
            setData(prev => ({ ...prev, error: error.message, isLoading: false }));
          }
        });
      } catch (error) {
        setData(prev => ({ ...prev, error: error.message, isLoading: false }));
        console.error('Error loading data:', error);
      }
    };
    
    loadData();
  }, []);
  
  const processData = (rawData) => {
    // Group data by site and year
    const bySiteYear = _.groupBy(rawData, row => `${row.site}_${row.year}`);
    
    // Get unique sites
    const sites = [...new Set(rawData.map(row => row.site))];
    
    // Initialize selection with just the first site
    setSelectedSites(sites.length > 0 ? [sites[0]] : []);
    
    // Process data for each site
    const byYearSite = {};
    const differencesBySite = {};
    const integralBySite = {};
    
    sites.forEach(site => {
      // Get data for this site for both years
      const data2021 = (bySiteYear[`${site}_2021`] || [])
        .sort((a, b) => a.distAlong - b.distAlong);
      
      const data2024 = (bySiteYear[`${site}_2024`] || [])
        .sort((a, b) => a.distAlong - b.distAlong);
      
      // Store processed data by year and site
      byYearSite[site] = {
        2021: data2021,
        2024: data2024
      };
      
      // Create a mapping to round distAlong values to help with matching
      // This helps when distAlong values don't exactly match between years
      const matchedPoints = {};
      data2021.forEach(row => {
        // Round to 3 decimal places for matching
        const roundedDist = row.distAlong.toFixed(3);
        matchedPoints[roundedDist] = {
          distAlong: row.distAlong,
          elev2021: row.elevation,
          elev2024: null,
          diff: null
        };
      });
      
      data2024.forEach(row => {
        const roundedDist = row.distAlong.toFixed(3);
        if (matchedPoints[roundedDist]) {
          matchedPoints[roundedDist].elev2024 = row.elevation;
          matchedPoints[roundedDist].diff = row.elevation - matchedPoints[roundedDist].elev2021;
        } else {
          matchedPoints[roundedDist] = {
            distAlong: row.distAlong,
            elev2021: null,
            elev2024: row.elevation,
            diff: null
          };
        }
      });
      
      // Convert the matchedPoints object to an array for the differences chart
      // Only include points where we have both years' data
      const matchedPointsArray = Object.values(matchedPoints)
        .filter(point => point.elev2021 !== null && point.elev2024 !== null)
        .sort((a, b) => a.distAlong - b.distAlong);
      
      // Compute differences and store
      differencesBySite[site] = matchedPointsArray.map(point => ({
        distAlong: point.distAlong,
        difference: point.diff
      }));
      
      // Compute integral (cumulative sum of differences * dx)
      let runningSum = 0;
      integralBySite[site] = matchedPointsArray.map((point, index, arr) => {
        if (index > 0) {
          // Calculate actual dx between this point and previous point
          const actualDx = point.distAlong - arr[index-1].distAlong;
          // Trapezoidal rule for integration: avg height * width
          const avgDiff = (point.diff + arr[index-1].diff) / 2;
          runningSum += avgDiff * actualDx;
        }
        return {
          distAlong: point.distAlong,
          integral: runningSum
        };
      });
    });
    
    setData({
      byYearSite,
      differencesBySite,
      integralBySite,
      sites,
      isLoading: false,
      error: null
    });
  };
  
  const toggleSite = (site) => {
    if (selectedSites.includes(site)) {
      setSelectedSites(selectedSites.filter(s => s !== site));
    } else {
      setSelectedSites([...selectedSites, site]);
    }
  };
  
  const selectAllSites = () => {
    setSelectedSites([...data.sites]);
  };
  
  const deselectAllSites = () => {
    setSelectedSites([]);
  };
  
  if (data.isLoading) {
    return <div className="text-center p-8">Loading data...</div>;
  }
  
  if (data.error) {
    return <div className="text-center p-8 text-red-600">Error: {data.error}</div>;
  }
  
  return (
    <div className="flex flex-col space-y-6 p-4">
      <h1 className="text-2xl font-bold">Elevation Analysis Dashboard</h1>
      
      <div className="flex flex-wrap gap-2 mb-4">
        <button 
          onClick={selectAllSites} 
          className="px-3 py-1 bg-blue-600 text-white rounded"
        >
          Select All
        </button>
        <button 
          onClick={deselectAllSites} 
          className="px-3 py-1 bg-gray-600 text-white rounded"
        >
          Deselect All
        </button>
        {data.sites.map(site => (
          <button
            key={site}
            onClick={() => toggleSite(site)}
            className={`px-3 py-1 rounded ${
              selectedSites.includes(site) 
                ? 'bg-blue-100 border border-blue-500' 
                : 'bg-gray-100 border border-gray-400'
            }`}
            style={{ 
              borderColor: selectedSites.includes(site) ? colorMap[site] : undefined,
              color: selectedSites.includes(site) ? colorMap[site] : undefined
            }}
          >
            {site}
          </button>
        ))}
      </div>
      
      {/* Plot 1: Elevation vs distAlong by site and year */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Elevation Profiles by Site and Year</h2>
        {selectedSites.map(site => (
          <div key={`chart-${site}`} className="mb-6">
            <h3 className="text-md font-medium mb-1">{site}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="distAlong" 
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  label={{ value: 'Distance Along (m)', position: 'insideBottomRight', offset: -5 }}
                />
                <YAxis 
                  label={{ value: 'Elevation (m)', angle: -90, position: 'insideLeft' }}
                  domain={['auto', 'auto']}
                />
                <Tooltip 
                  formatter={(value) => [value.toFixed(2) + ' m', 'Elevation']}
                  labelFormatter={(value) => `Distance: ${value.toFixed(2)} m`}
                />
                <Legend />
                
                {data.byYearSite[site][2021].length > 0 && (
                  <Line
                    name={`${site} (2021)`}
                    data={data.byYearSite[site][2021]}
                    dataKey="elevation"
                    stroke={yearColorMap[2021]}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                
                {data.byYearSite[site][2024].length > 0 && (
                  <Line
                    name={`${site} (2024)`}
                    data={data.byYearSite[site][2024]}
                    dataKey="elevation"
                    stroke={yearColorMap[2024]}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
      
      {/* Plot 2: Elevation Differences (2024 - 2021) */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Elevation Differences (2024 - 2021)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="distAlong" 
              type="number"
              domain={['dataMin', 'dataMax']}
              label={{ value: 'Distance Along (m)', position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis 
              label={{ value: 'Elevation Difference (m)', angle: -90, position: 'insideLeft' }}
              domain={['auto', 'auto']}
            />
            <Tooltip 
              formatter={(value) => [value.toFixed(3) + ' m', 'Difference']}
              labelFormatter={(value) => `Distance: ${value.toFixed(2)} m`}
            />
            <Legend />
            
            {selectedSites.map(site => (
              data.differencesBySite[site] && (
                <Line
                  key={site}
                  name={site}
                  data={data.differencesBySite[site]}
                  dataKey="difference"
                  stroke={colorMap[site]}
                  dot={false}
                  isAnimationActive={false}
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Plot 3: Integrated Elevation Difference */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Integrated Elevation Difference</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="distAlong" 
              type="number"
              domain={['dataMin', 'dataMax']}
              label={{ value: 'Distance Along (m)', position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis 
              label={{ value: 'Integrated Difference (m²)', angle: -90, position: 'insideLeft' }}
              domain={['auto', 'auto']}
            />
            <Tooltip 
              formatter={(value) => [value.toFixed(3) + ' m²', 'Integrated Difference']}
              labelFormatter={(value) => `Distance: ${value.toFixed(2)} m`}
            />
            <Legend />
            
            {selectedSites.map(site => (
              data.integralBySite[site] && (
                <Line
                  key={site}
                  name={site}
                  data={data.integralBySite[site]}
                  dataKey="integral"
                  stroke={colorMap[site]}
                  dot={false}
                  isAnimationActive={false}
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ElevationAnalysis;