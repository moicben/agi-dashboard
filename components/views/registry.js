import ContainersView from './ContainersView.jsx';
import AnalyticsView from './AnalyticsView.jsx';
import AndroidView from './AndroidView.jsx';
import { AnalyticsIcon, AndroidIcon, ContainersIcon } from '../ViewIcons.jsx';

export const viewRegistry = [
    {
        id: 'analytics',
        label: 'Analytics',
        title: 'Analytics',
        description: 'Funnel de conversion',
        Component: AnalyticsView,
        Icon: AnalyticsIcon
    },
    {
        id: 'android',
        label: 'Android',
        title: 'Android',
        description: 'Remote control + screenshots',
        Component: AndroidView,
        Icon: AndroidIcon
    },
    {
        id: 'containers',
        label: 'Containers',
        title: 'Containers',
        description: 'Suivi VNC en temps réel',
        Component: ContainersView,
        Icon: ContainersIcon
    }
];

export const DEFAULT_VIEW_ID = 'analytics';
