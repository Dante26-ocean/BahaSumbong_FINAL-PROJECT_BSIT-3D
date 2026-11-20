
import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  signal
} from '@angular/core';

import { RouterLink } from '@angular/router';

import {
  collection,
  onSnapshot,
  query,
  where,
  Unsubscribe
} from 'firebase/firestore';

import {
  map as createMap,
  tileLayer,
  circleMarker,
  layerGroup,
  Map as LeafletMap,
  CircleMarker,
  LayerGroup,
  LeafletMouseEvent
} from 'leaflet';

import { auth, db } from '../../../firebase';

// Newly selected report location.
interface ReportLocation {
  latitude: number;
  longitude: number;
}

// Existing report with saved coordinates.
interface MappedReport {
  id: string;
  latitude: number;
  longitude: number;
  problemType: string;
  status: string;
}

@Component({
  selector: 'app-map',
  imports: [RouterLink],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class Map implements AfterViewInit, OnDestroy {

  @ViewChild('mapContainer')
  mapContainer!: ElementRef<HTMLDivElement>;

  // Leaflet instances.
  private leafletMap: LeafletMap | null = null;
  private selectedMarker: CircleMarker | null = null;
  private savedMarkers: LayerGroup | null = null;

  // Firestore listener.
  private unsubscribeReports: Unsubscribe | null = null;
  private destroyed = false;

  // Newly selected location.
  readonly selectedLocation = signal<ReportLocation | null>(
    null
  );

  // Reports already saved in Firestore.
  readonly mappedReports = signal<MappedReport[]>([]);

  // Selected existing report.
  readonly selectedSavedReport = signal<MappedReport | null>(
    null
  );

  // Loading and error states.
  readonly reportsLoading = signal(true);
  readonly reportsError = signal('');

  // Tagoloan, Misamis Oriental, Philippines.
  private readonly defaultLatitude = 8.5391;
  private readonly defaultLongitude = 124.7538;

  ngAfterViewInit(): void {

    this.initializeMap();

    // Retrieve the resident's saved report markers.
    void this.loadSavedReportMarkers();

  }

  private initializeMap(): void {

    if (this.leafletMap) {
      return;
    }

    this.leafletMap = createMap(
      this.mapContainer.nativeElement,
      {
        center: [
          this.defaultLatitude,
          this.defaultLongitude
        ],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: true
      }
    );

    // OpenStreetMap tiles.
    tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    ).addTo(this.leafletMap);

    // Separate layer for reports from Firestore.
    this.savedMarkers = layerGroup().addTo(
      this.leafletMap
    );

    // Click the map to select a NEW report location.
    this.leafletMap.on(
      'click',
      (event: LeafletMouseEvent) => {

        this.markReportLocation(
          event.latlng.lat,
          event.latlng.lng
        );

      }
    );

    console.log(
      'BahaSumbong interactive map initialized.'
    );

  }

  // Select a new report location.
  private markReportLocation(
    latitude: number,
    longitude: number
  ): void {

    if (!this.leafletMap) {
      return;
    }

    this.selectedLocation.set({
      latitude,
      longitude
    });

    if (this.selectedMarker) {

      this.selectedMarker.setLatLng([
        latitude,
        longitude
      ]);

    } else {

      // Blue marker: newly selected location.
      this.selectedMarker = circleMarker(
        [latitude, longitude],
        {
          radius: 10,
          color: '#0F1F33',
          weight: 3,
          fillColor: '#2E5E99',
          fillOpacity: 1,
          bubblingMouseEvents: false
        }
      ).addTo(this.leafletMap);

      this.selectedMarker.bindPopup(
        'Selected new report location'
      );

    }

    this.selectedMarker.openPopup();

  }

  // Remove the newly selected location.
  clearSelectedLocation(): void {

    if (this.selectedMarker) {
      this.selectedMarker.remove();
      this.selectedMarker = null;
    }

    this.selectedLocation.set(null);

  }

  // Retrieve reports belonging to the current resident.
  private async loadSavedReportMarkers(): Promise<void> {

    try {

      await auth.authStateReady();

      if (this.destroyed) {
        return;
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {

        this.reportsError.set(
          'Please sign in to view your saved reports.'
        );

        this.reportsLoading.set(false);
        return;

      }

      // Match the existing Firestore ownership rules.
      const reportsQuery = query(
        collection(db, 'reports'),
        where('residentId', '==', currentUser.uid)
      );

      // Receive real-time report changes.
      this.unsubscribeReports = onSnapshot(

        reportsQuery,

        (snapshot) => {

          if (this.destroyed || !this.savedMarkers) {
            return;
          }

          // Remove old displayed markers before refreshing.
          this.savedMarkers.clearLayers();

          const reportsWithCoordinates: MappedReport[] = [];

          for (const reportDoc of snapshot.docs) {

            const data = reportDoc.data();

            const latitude = data['latitude'];
            const longitude = data['longitude'];

            // Older reports may not have coordinates.
            if (
              typeof latitude !== 'number' ||
              typeof longitude !== 'number' ||
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              latitude < -90 ||
              latitude > 90 ||
              longitude < -180 ||
              longitude > 180
            ) {
              continue;
            }

            const report: MappedReport = {
              id: reportDoc.id,

              latitude,
              longitude,

              problemType:
                typeof data['problemType'] === 'string'
                  ? data['problemType']
                  : 'unknown',

              status:
                typeof data['status'] === 'string'
                  ? data['status']
                  : 'unknown'
            };

            reportsWithCoordinates.push(report);

            // Orange marker: an existing saved report.
            const marker = circleMarker(
              [latitude, longitude],
              {
                radius: 9,
                color: '#A84C00',
                weight: 2,
                fillColor: '#F59E0B',
                fillOpacity: 0.9,

                // Prevent clicking an existing marker
                // from selecting a new location.
                bubblingMouseEvents: false
              }
            );

            marker.bindPopup(
              'Saved community report'
            );

            // Display report details below the map.
            marker.on('click', () => {
              this.selectedSavedReport.set(report);
            });

            marker.addTo(this.savedMarkers);

          }

          this.mappedReports.set(
            reportsWithCoordinates
          );

          // Keep the selected report updated.
          const selectedId = this.selectedSavedReport()?.id;

          const updatedSelection =
            reportsWithCoordinates.find(
              report => report.id === selectedId
            ) ?? null;

          this.selectedSavedReport.set(updatedSelection);

          this.reportsError.set('');
          this.reportsLoading.set(false);

        },

        (error) => {

          if (this.destroyed) {
            return;
          }

          console.error(
            'Error loading map report markers:',
            error
          );

          this.reportsError.set(
            'Unable to load saved report markers.'
          );

          this.reportsLoading.set(false);

        }

      );

    } catch (error) {

      console.error(
        'Error initializing report markers:',
        error
      );

      if (!this.destroyed) {

        this.reportsError.set(
          'Unable to initialize saved report locations.'
        );

        this.reportsLoading.set(false);

      }

    }

  }

  ngOnDestroy(): void {

    this.destroyed = true;

    // Stop Firestore updates.
    this.unsubscribeReports?.();

    // Remove the selected location marker.
    if (this.selectedMarker) {
      this.selectedMarker.remove();
      this.selectedMarker = null;
    }

    // Remove all saved report markers.
    if (this.savedMarkers) {
      this.savedMarkers.clearLayers();
      this.savedMarkers = null;
    }

    // Destroy Leaflet map.
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }

  }

}
